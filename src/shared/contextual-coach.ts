import { coachPhase } from './coach.js'
import type { CoachView, HeroData, Tip } from './coach.js'
import type { Matchup } from './guide.js'
import { counterItems } from './item-coaching.js'
import type { ItemRecommendation } from './item-coaching.js'
import type { ItemInfo } from './items.js'
import type { Kit, KitsDb, Status } from './mechanics.js'
import { CONTROL, teamProfile } from './mechanics.js'
import type { Frame, GameType, Hero, HeroStatus, Role } from './model.js'

export const brackets = ['Herald', 'Guardian', 'Crusader', 'Archon', 'Legend', 'Ancient', 'Divine', 'Immortal'] as const
export type Bracket = typeof brackets[number]
export type CoachingContext = {
  phase: CoachView['phase']
  matchup: { name: string; rate: number; games: number } | null
  bracket: { name: Bracket; rate: number; games: number } | null
  tips: Tip[]
  items?: ItemRecommendation[]
  offRole: boolean
}

export type CoachHero = { hero: Hero; kit?: Kit }
const control = (kit?: Kit) => kit?.a.find((a) => !a.p && a.c.some((effect) => (CONTROL[effect] ?? 0) >= 0.6))
const followUp = (kit?: Kit) => kit?.a.find((a) => !a.p && a.c.some((effect) => ['heal', 'barrier', 'dispel'].includes(effect)))

// Maps each GSI own-player debuff flag (zero-inference, already read for the status strip/death breakdown) to
// the mechanics-model Status tag an ability that inflicts it would carry — letting a death matched against
// "which revealed enemy's kit can actually do that to you" stand in for a real killer confirmation when you
// never typed one in. No new data and no guessing: both sides of the match (your own debuff, their own kit
// tags) were already read for an unrelated purpose each.
const STATUS_TO_EFFECT: Partial<Record<keyof HeroStatus, Status>> = {
  stunned: 'stun', silenced: 'silence', disarmed: 'disarm', hexed: 'hex', muted: 'mute', broken: 'break',
}

/** Who to actually worry about: a hero you confirmed killed you, then one whose kit can inflict the exact
 * debuff you were still under right before dying (`beforeStatus` — a real, zero-guess cross-reference, not a
 * confirmation but stronger evidence than "has some dangerous ability"), then any hero with a notably strong
 * control ability, then whoever the real matchup data says is your worst lane/lineup matchup. */
export function knownThreat(opponents: CoachHero[], rows: Matchup[], killer: number | null = null, beforeStatus?: Partial<HeroStatus> | null) {
  const activeEffects = new Set((Object.keys(STATUS_TO_EFFECT) as (keyof HeroStatus)[])
    .filter((key) => beforeStatus?.[key]).map((key) => STATUS_TO_EFFECT[key]!))
  const ranked = opponents.map(({ hero, kit }) => ({
    hero, kit, ability: kit?.a.find((a) => a.x && !a.p && a.c.some((effect) => (CONTROL[effect] ?? 0) >= 0.6)) ?? control(kit),
    statusMatch: activeEffects.size > 0 && (kit?.a.some((a) => !a.p && a.c.some((effect) => activeEffects.has(effect))) ?? false),
    rate: rows.find((row) => row.enemy === hero.id && row.games >= 60)?.rate ?? 50,
  })).sort((a, b) => Number(b.hero.id === killer) - Number(a.hero.id === killer) ||
    Number(b.statusMatch) - Number(a.statusMatch) ||
    Number(Boolean(b.ability)) - Number(Boolean(a.ability)) || a.rate - b.rate)
  const entry = ranked[0]
  return entry ? { name: entry.hero.name, ability: entry.ability, confirmed: entry.hero.id === killer,
    likely: entry.hero.id !== killer && entry.statusMatch,
    magic: (entry.kit?.a.filter((a) => a.d === 2).length ?? 0) >= 2 } : null
}

// Neutral item tiers unlock on a fixed, Valve-set schedule (minutes into the game) — approximate, same caveat
// as the map timing alerts and the Roshan/Aegis timer: Valve has moved these numbers across patches before.
const NEUTRAL_TIER_MINUTES = [7, 17, 27, 37, 60]
function neutralTierDue(frame: Frame, mode: GameType | null) {
  const minutes = (frame.clock / 60) * (mode === 'Turbo' ? 1.35 : 1)
  let tier = 0
  for (const threshold of NEUTRAL_TIER_MINUTES) if (minutes >= threshold) tier++
  return tier
}

const lanePlan: Record<Role, string> = {
  Carry: 'Keep the wave near your tower and reserve gold for regen if you are being pushed off last hits.',
  Mid: 'Secure the ranged creep and shove before leaving for a rune or a rotation.',
  Offlane: 'Pressure the enemy carry when your support can trade with you. Preserve health for the next wave.',
  'Soft support': 'Contest pulls and move when your offlaner can safely take the next wave alone.',
  'Hard support': 'Trade away from your carry’s creeps and pull when the wave is pushing away from your tower.',
}

/** A hero whose Valve-tagged roles (hero.roles — its usual job, not the lane you picked for it) don't match the
 * selected role plays laning very differently from the role's generic plan above: a Sniper put in support still
 * wants to poke and deny from range, not last-hit, and a support-tagged hero pushed into a core slot needs farm
 * priority the generic core text doesn't call out. Off-role is real and common (support Sniper, core Lion in a
 * pub) — this names it instead of giving advice that quietly assumes the hero is the role's usual pick. */
export function laningGuidance(role: Role, hero: Hero): { text: string; offRole: boolean } {
  const core = ['Carry', 'Mid', 'Offlane'].includes(role)
  const taggedCore = hero.roles.includes('Carry') && !hero.roles.includes('Support')
  const taggedSupport = hero.roles.includes('Support')
  if (core && taggedSupport && !taggedCore) {
    return { text: `${hero.name} is usually a support, not a ${role.toLowerCase()} — prioritize farm and levels for yourself this lane rather than giving way for teammates; your team is relying on you to carry a fight later, which isn't this hero's normal job.`, offRole: true }
  }
  if (!core && taggedCore && !taggedSupport) {
    return { text: `${hero.name} is usually a core, not a ${role.toLowerCase()} — don't contest last hits with your carry; your value here is ${hero.ranged ? 'poking and denying from range, plus wards and dewarding' : 'trading and wards, since you lack ranged poke'}, not farm.`, offRole: true }
  }
  return { text: lanePlan[role], offRole: false }
}

export function contextualCoach(input: {
  frame: Frame; role: Role; mode: GameType | null; hero: Hero; kit?: Kit; opponents: CoachHero[]; allies?: CoachHero[]; kits?: KitsDb | null; items?: Record<string, ItemInfo>
  rows: Matchup[]; bracket: Bracket | null; data?: HeroData; plan: { key: string; name: string; cost: number }[]
  seen: Record<string, number>; baseline: CoachView; itemBias?: Record<string, number>
}): CoachingContext {
  const { frame, role, mode, kit, opponents, rows, baseline } = input
  const lane = laningGuidance(role, input.hero)
  const phase = mode === 'Turbo' ? coachPhase(frame.clock, true) : baseline.phase
  const worst = rows.find((row) => row.games >= 60 && row.rate < 48)
  const difficult = opponents.find(({ hero }) => hero.id === worst?.enemy)
  const threat = knownThreat(opponents, rows)
  const ownControl = control(kit)
  const partners = (input.allies ?? []).map((ally) => ({ name: ally.hero.name, setup: control(ally.kit), save: followUp(ally.kit) }))
  const partner = partners.find((ally) => ownControl ? ally.setup : ally.save || ally.setup)
  const enemyProfile = teamProfile(opponents.map(({ hero }) => hero.id), input.kits ?? null)
  const ultimate = kit?.a.find((ability) => ability.u && !ability.p)
  const nextItem = input.plan.find((item) => input.seen[item.key] == null && !frame.items.includes(item.key))
  const support = role === 'Soft support' || role === 'Hard support'
  const behind = frame.deaths != null && frame.deaths >= Math.max(2, Math.floor(frame.clock / 240))
    || (!support && baseline.lhPct != null && baseline.lhPct < 25)
  const tips: Tip[] = []
  if (phase === 'Laning') {
    tips.push(behind ? { level: 'warn', text: role === 'Mid' ? 'Secure XP and clear the wave safely before contesting a rune.' :
      'Recover near allied vision and ask for help controlling the next wave.' } : { level: lane.offRole ? 'warn' : 'info', text: lane.text })
    if (ownControl && !partner) tips.push({ level: 'info', text: `Hold ${ownControl.n} for a trade your teammate can follow up on.` })
  } else if (phase === 'Mid game') {
    tips.push({ level: 'info', text: behind && !support ? 'Take safe waves near your team and wait for a fight that favours you.' :
      role === 'Mid' ? 'Check the river rune before you commit to a rotation — it is often the difference between arriving with or without a spell up.' :
      role === 'Offlane' ? 'Set up the next initiation with an ally in range to follow up.' : support ? 'Move with a core and establish vision around the next objective.' :
      'Push a safe wave before rotating toward the next objective.' })
    if (ultimate && frame.level != null && frame.level >= 6 && mode !== 'Ability Draft') {
      tips.push({ level: 'info', text: `Check ${ultimate.n} before grouping. Use the next window when your team can follow up.` })
    }
  } else {
    tips.push({ level: 'info', text: support ? 'Keep vision and saves available for the next objective. Move with an ally.' :
      'Have buyback and teleport ready before a fight breaks out around an objective.' })
  }
  if (mode === 'Ability Draft') {
    // The catalogue has native hero abilities. Ability Draft can replace the entire kit.
    return { phase, matchup: null, bracket: null, tips: tips.slice(0, 1), offRole: false }
  }
  if (threat?.ability) {
    tips.splice(0, 0, { level: 'warn', text: `Watch ${threat.name}’s ${threat.ability.n}. ${phase === 'Laning' ? 'If they are in your lane, trade after they use it.' : 'Keep an exit and wait for that spell before committing.'}` })
  }
  if (partner) {
    const setup = ownControl ? partner.setup : partner.save ?? partner.setup
    const action = ownControl && partner.setup
      ? `Follow ${partner.name}’s ${partner.setup.n} with ${ownControl.n} as the first disable ends.`
      : `Fight within range of ${partner.name}’s ${setup?.n} so they can ${setup === partner.save ? 'cover your retreat' : 'set up your damage'}.`
    tips.splice(Math.min(1, tips.length), 0, { level: 'info', text: phase === 'Laning' ? `If you lane with ${partner.name}, ${action[0].toLowerCase() + action.slice(1)}` : action })
  }
  if (nextItem && phase !== 'Laning') {
    tips.splice(Math.min(3, tips.length), 0, { level: 'info', text: frame.gold != null && frame.gold >= nextItem.cost ? `You can afford ${nextItem.name} right now — buy it on your next trip back.` :
      `Check the remaining components for ${nextItem.name} before your next rotation.`, items: [nextItem.key] })
  }
  if (input.items) {
    const dueTier = neutralTierDue(frame, mode)
    const heldTier = Math.max(0, ...frame.items.map((key) => input.items![key]?.neutralTier ?? 0))
    if (dueTier > heldTier) {
      tips.push({ level: 'info', text: `Tier ${dueTier} neutral items are up — check the shrine on your next trip back${heldTier ? ` (you're still on tier ${heldTier})` : ''}.` })
    }
  }
  const bracketIndex = input.bracket == null ? -1 : brackets.indexOf(input.bracket)
  const games = input.data?.pick[bracketIndex] ?? 0
  const wins = input.data?.win[bracketIndex] ?? 0
  return {
    phase, matchup: worst && difficult ? { name: difficult.hero.name, rate: Math.round(worst.rate), games: worst.games } : null,
    bracket: mode === 'Ranked' && input.bracket && games >= 100 && wins <= games ? { name: input.bracket, rate: Math.round(100 * wins / games), games } : null,
    tips: tips.slice(0, 4), offRole: lane.offRole,
    items: input.items ? counterItems(frame, role, phase, opponents, enemyProfile, input.items, threat, input.itemBias ?? {}) : undefined,
  }
}
