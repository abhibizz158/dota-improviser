import type { CoachView } from './coach.js'
import type { ItemInfo } from './items.js'
import type { CoachHero } from './contextual-coach.js'
import type { Status, TeamProfile } from './mechanics.js'
import type { Frame, Role } from './model.js'

export type ItemRecommendation = {
  key: string; name: string; reason: string; timing: string; remaining: number; goal: string;
}

type Candidate = { key: string; reason: string; priority: number }

export function counterItems(frame: Frame, role: Role, phase: CoachView['phase'], opponents: CoachHero[], team: TeamProfile | null, items: Record<string, ItemInfo>): ItemRecommendation[] {
  if (!opponents.length || !frame.itemsObserved || frame.clock < 0) return []
  const support = role === 'Soft support' || role === 'Hard support'
  const early = phase === 'Laning' || (frame.level != null && frame.level < 6 && phase !== 'Late game')
  const owned = new Set(frame.items)
  const known = (tags: string[]) => opponents.filter(({ hero }) => tags.some((tag) => hero.roles.includes(tag)))
  const hasSpell = (effect: Status) => opponents.find(({ kit }) => kit?.a.some((ability) => ability.c.includes(effect)))
  const invis = hasSpell('invis') ?? opponents.find(({ hero }) => ['riki', 'bounty_hunter', 'clinkz', 'weaver', 'nyx_assassin'].includes(hero.slug))
  const medusa = opponents.find(({ hero }) => hero.slug === 'medusa')
  const evasion = hasSpell('evasion') ?? opponents.find(({ hero }) => hero.slug === 'phantom_assassin' || hero.slug === 'brewmaster')
  const magic = team?.damage.mag != null ? team.damage.mag >= 0.47 : known(['Nuker']).length >= 2
  const physical = team?.damage.phys != null ? team.damage.phys >= 0.63 : known(['Carry']).length >= 2
  const sustain = (team?.sustain ?? 0) >= 2 || (team?.sustain === 1 && opponents.some(({ hero }) => ['huskar', 'morphling', 'necrolyte', 'alchemist'].includes(hero.slug)))
  const control = (team?.hard ?? known(['Disabler']).length) >= 2
  const piercing = (team?.piercing ?? 0) > 0
  const candidates: Candidate[] = []
  const add = (key: string, reason: string, priority: number, covered: string[] = []) => {
    if (!owned.has(key) && !covered.some((item) => owned.has(item))) candidates.push({ key, reason, priority })
  }

  if (invis) add(support ? 'ward_sentry' : 'dust', `Bring detection when contesting ${invis.hero.name}.`, 95, ['dust', 'ward_sentry', 'gem'])
  if (early) {
    if (magic) add('magic_stick', 'Capture charges from frequent enemy spell casts during lane trades.', 82, ['magic_wand', 'holy_locket'])
    if (physical) add('ring_of_protection', 'Add armor for right-click trades while you develop your first item.', 78, ['chainmail', 'buckler', 'platemail'])
    if (control && !frame.items.some((key) => /boots|treads/.test(key))) add('wind_lace', 'Create space before their control spells are in range.', 72)
  } else {
    if (piercing || (control && support)) add('force_staff', 'Reposition before the catch, or move an ally out when the spell allows it.', 94, ['hurricane_pike'])
    if (control && !support) {
      if (!piercing || (team?.hard ?? 0) - (team?.piercing ?? 0) >= 2) {
        add('black_king_bar', piercing ? 'Cover their non-piercing spells. Stay out of range of disables that pierce.' : 'Activate it before their disables land so you can commit safely.', piercing ? 81 : 93)
      }
    }
    if (magic) {
      if (support) add('glimmer_cape', 'Save an ally before the enemy spell burst lands.', 86)
      else if (role === 'Offlane') add('pipe', 'Consider a team magic barrier if a teammate is not already building one.', 85)
      else add(piercing ? 'cloak' : 'black_king_bar', piercing ? 'Add magic resistance while respecting piercing control.' : 'Prepare for their spell burst before the next team fight.', 82, ['black_king_bar', 'pipe', 'eternal_shroud'])
    }
    if (physical) {
      if (support) add('ghost', 'Use it against right-click focus. Avoid activating it into magic burst.', 83, ['ethereal_blade'])
      else if (role === 'Offlane') add('heavens_halberd', 'Disarm a right-click threat when the target can be affected.', 79)
    }
    if (sustain && (support || role === 'Offlane')) add('spirit_vessel', 'Coordinate healing reduction against the enemy sustain before your team commits.', 84)
    if (medusa && (role === 'Carry' || role === 'Mid') && frame.heroSlug !== 'antimage') {
      add('diffusal_blade', 'Mana burn can pressure Medusa’s Mana Shield if your hero can land repeated attacks.', 84, ['disperser'])
    }
    if (!support && evasion && phase === 'Late game') {
      add('monkey_king_bar', `Add accuracy against ${evasion.hero.name}’s evasion when attacks are missing.`, 87)
    }
  }

  return [...new Map(candidates.sort((a, b) => a.priority - b.priority).map((candidate) => [candidate.key, candidate])).values()]
    .flatMap(({ key, reason, priority }) => {
      const item = items[key]
      if (!item || item.c <= 0) return []
      // Inventory is a set, so subtract each distinct verified direct component at most once.
      const components = [...new Set(item.p)].filter((part) => owned.has(part))
      const remaining = Math.max(0, item.c - components.reduce((sum, part) => sum + (items[part]?.c ?? 0), 0))
      const affordable = frame.gold != null && frame.gold >= remaining
      const goldShort = frame.gold != null ? Math.max(0, remaining - frame.gold) : null
      const window = frame.gpm && goldShort != null ? Math.max(1, Math.ceil(goldShort / frame.gpm)) : null
      const timing = affordable ? (phase === 'Late game' && item.c > 500 ? 'Gold available · check buyback' : 'Gold available now')
        : early ? 'Next lane trade' : phase === 'Late game' ? 'Before the next late-game fight' : 'Before the next contested objective'
      const goal = affordable ? (remaining === item.c ? `${item.c.toLocaleString('en-US')} gold` : `About ${remaining.toLocaleString('en-US')} gold left`)
        : window == null || goldShort == null ? `About ${remaining.toLocaleString('en-US')} gold remaining`
          : `About ${goldShort.toLocaleString('en-US')} more gold · ~${window} min at current GPM`
      return [{ key, name: item.n, reason, timing, remaining, goal,
        score: priority + (affordable ? 8 : 0) + components.length * 5 - (window != null ? Math.min(16, window * (support ? 2 : 1)) : 0) }]
    }).sort((a, b) => b.score - a.score).slice(0, 2)
    .map(({ key, name, reason, timing, remaining, goal }) => ({ key, name, reason, timing, remaining, goal }))
}
