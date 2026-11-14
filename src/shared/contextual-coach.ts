import type { CoachView, HeroData, Tip } from './coach.js'
import type { Matchup } from './guide.js'
import type { Kit } from './mechanics.js'
import { CONTROL } from './mechanics.js'
import type { Frame, GameType, Hero, Role } from './model.js'

export const brackets = ['Herald', 'Guardian', 'Crusader', 'Archon', 'Legend', 'Ancient', 'Divine', 'Immortal'] as const
export type Bracket = typeof brackets[number]
export type CoachingContext = {
  phase: CoachView['phase']
  matchup: { name: string; rate: number; games: number } | null
  bracket: { name: Bracket; rate: number; games: number } | null
  tips: Tip[]
}

const lanePlan: Record<Role, string> = {
  Carry: 'Keep the wave near your tower and reserve gold for regen if you are being pushed off last hits.',
  Mid: 'Secure the ranged creep and shove before leaving for a rune or a rotation.',
  Offlane: 'Pressure the enemy carry when your support can trade with you. Preserve health for the next wave.',
  'Soft support': 'Contest pulls and move when your offlaner can safely take the next wave alone.',
  'Hard support': 'Trade away from your carry’s creeps and pull when the wave is pushing away from your tower.',
}

export function contextualCoach(input: {
  frame: Frame; role: Role; mode: GameType | null; kit?: Kit; opponents: { hero: Hero; kit?: Kit }[]
  rows: Matchup[]; bracket: Bracket | null; data?: HeroData; plan: { key: string; name: string; cost: number }[]
  seen: Record<string, number>; baseline: CoachView
}): CoachingContext {
  const { frame, role, mode, kit, opponents, rows, baseline } = input
  const phase = mode === 'Turbo' ? frame.clock < 420 ? 'Laning' : frame.clock < 1080 ? 'Mid game' : 'Late game' : baseline.phase
  const sampled = rows.filter((row) => row.games >= 60)
  const worst = sampled.find((row) => row.rate < 48)
  const control = (candidate?: Kit) => candidate?.a.find((ability) => !ability.p && ability.c.some((effect) => (CONTROL[effect] ?? 0) >= 0.8))
  const difficult = opponents.find(({ hero }) => hero.id === worst?.enemy)
  const opponent = difficult && control(difficult.kit) ? difficult : opponents.find(({ kit }) => control(kit))
  const ownControl = control(kit)
  const threat = control(opponent?.kit)
  const ultimate = kit?.a.find((ability) => ability.u && !ability.p)
  const nextItem = input.plan.find((item) => input.seen[item.key] == null && !frame.items.includes(item.key))
  const support = role === 'Soft support' || role === 'Hard support'
  const behind = frame.deaths != null && frame.deaths >= Math.max(2, Math.floor(frame.clock / 240))
    || (!support && baseline.lhPct != null && baseline.lhPct < 25)
  const tips: Tip[] = []
  if (phase === 'Laning') {
    tips.push(behind ? { level: 'warn', text: role === 'Mid' ? 'Secure XP and clear the wave safely before contesting a rune.' :
      'Recover near allied vision and ask for help controlling the next wave.' } : { level: 'info', text: lanePlan[role] })
    if (ownControl) tips.push({ level: 'info', text: `Hold ${ownControl.n} for a trade your teammate can follow up on.` })
  } else if (phase === 'Mid game') {
    tips.push({ level: 'info', text: behind && !support ? 'Take safe waves near your team before committing to the next fight.' :
      role === 'Offlane' ? 'Set up the next initiation with an ally in range to follow up.' : support ? 'Move with a core and establish vision around the next objective.' :
      'Push a safe wave before rotating toward the next objective.' })
    if (ultimate && frame.level != null && frame.level >= 6 && mode !== 'Ability Draft') {
      tips.push({ level: 'info', text: `Check ${ultimate.n} before grouping. Use the next window when your team can follow up.` })
    }
  } else {
    tips.push({ level: 'info', text: support ? 'Keep vision and saves available for the next objective. Move with an ally.' :
      'Check buyback and teleport before committing to a fight around an objective.' })
  }
  if (mode === 'Ability Draft') {
    // The catalogue has native hero abilities. Ability Draft can replace the entire kit.
    return { phase, matchup: null, bracket: null, tips: tips.slice(0, 1) }
  }
  if (opponent && threat) {
    tips.splice(1, 0, { level: 'warn', text: `Watch ${opponent.hero.name}’s ${threat.n}. ${phase === 'Laning' ? 'If they are in your lane, keep an escape route and trade after they use it.' : 'Keep a way out and wait for the spell to be used before committing.'}` })
  }
  if (nextItem && phase !== 'Laning') {
    tips.push({ level: 'info', text: frame.gold != null && frame.gold >= nextItem.cost ? `${nextItem.name} is affordable from your current gold. Check buyback before committing.` :
      `Check the remaining components for ${nextItem.name} before your next rotation.`, items: [nextItem.key] })
  }
  const bracketIndex = input.bracket == null ? -1 : brackets.indexOf(input.bracket)
  const games = input.data?.pick[bracketIndex] ?? 0
  const wins = input.data?.win[bracketIndex] ?? 0
  return {
    phase, matchup: worst && difficult ? { name: difficult.hero.name, rate: Math.round(worst.rate), games: worst.games } : null,
    bracket: mode === 'Ranked' && input.bracket && games >= 100 && wins <= games ? { name: input.bracket, rate: Math.round(100 * wins / games), games } : null,
    tips: tips.slice(0, 4),
  }
}
