import type { ItemRecommendation } from './item-coaching.js'
import type { knownThreat } from './contextual-coach.js'
import { positionFit } from './brain.js'
import { roles } from './model.js'
import type { Frame, Hero, Role } from './model.js'
import type { Achievement, CoachView } from './coach.js'

export type RoleChoice = { role: Role; source: 'Manual' | 'Hero preference' | 'Match history' | 'Hero and lineup' | 'Default'; override: Role | null }

export function chooseRole(options: {
  override: Role | null; preferred?: Role; fallback: Role; automatic: boolean; hero?: Hero; teammates: Hero[]
  levels: Record<number, number[]>; history?: Partial<Record<Role, number>>
}): RoleChoice {
  const { override, preferred, fallback, automatic, hero, teammates, levels, history } = options
  if (override) return { role: override, source: 'Manual', override }
  if (preferred) return { role: preferred, source: 'Hero preference', override }
  if (!automatic || !hero) return { role: fallback, source: 'Default', override }

  const ranked = roles.map((role) => ({ role, weight: history?.[role] ?? 0 })).sort((a, b) => b.weight - a.weight)
  const [first, second] = ranked
  if (first.weight >= 2 && first.weight >= 1.5 * second.weight) return { role: first.role, source: 'Match history', override }

  const fit = (candidate: Hero, role: Role) => positionFit(candidate, role, levels[candidate.id])
  // Try distinct roles for known teammates. Their combined fit helps resolve flexible heroes.
  const fill = (index: number, open: Role[]): number => index >= teammates.length ? 0 : Math.max(...open.map((role) =>
    fit(teammates[index], role) + fill(index + 1, open.filter((other) => role !== other))))
  const scores = roles.map((role) => ({ role, score: fit(hero, role) + (history?.[role] ?? 0) / Math.max(1, first.weight) * 0.12 +
    (teammates.length ? 0.65 * fill(0, roles.filter((other) => role !== other)) : 0) }))
  scores.sort((a, b) => b.score - a.score)
  const close = scores.filter(({ score }) => scores[0].score - score < 0.04)
  if (close.length === roles.length) return { role: fallback, source: 'Default', override }
  return { role: close.find(({ role }) => role === fallback)?.role ?? scores[0].role, source: 'Hero and lineup', override }
}

/** Every achievement is scored from that hero's own real OpenDota item-popularity and timing data (see coach.ts) —
 * never a fixed hero/item list — so a core item counts on whichever hero and role actually bought it. */
export type AwardRecord = { heroId: number; label: string; role: Role; count: number; onTime: number; best: number | null; last: number | null }

/** An achievement that just flipped from live to done this tick, ready to award (keyed per hero so every hero's
 * progress is tracked separately). Callers gate this to matchmaking (ranked/normal) games only — practice lobbies
 * don't count toward the career trophy case, since they're not a real result. */
export function observeAchievement(previous: Frame | null, next: Frame, achievement: Achievement, awarded: Set<string>) {
  if (next.paused || next.heroId == null || next.clock < 0 || (previous && next.clock < previous.clock)) return null
  const id = next.heroId + ':' + achievement.id
  const happened = achievement.id === 'lh10' ? Boolean(previous) && previous!.clock < 600 && next.clock >= 600 :
    Boolean(previous?.itemsObserved) && next.itemsObserved && !previous!.items.includes(achievement.id) && achievement.got === next.clock
  if (achievement.state !== 'done' || !happened || awarded.has(id)) return null
  awarded.add(id)
  return { id, heroId: next.heroId, at: next.clock }
}

export type Recovery = { seconds: number | null; title: string; tip: string; followUp?: string; threat?: string; repeats?: number }

export function recoveryAdvice(frame: Frame, role: Role, view: CoachView | null, options: {
  threat?: ReturnType<typeof knownThreat>; nextItem?: { name: string; cost: number }; priorCases?: number; counterItem?: ItemRecommendation;
} = {}): Recovery | null {
  if (frame.alive || frame.clock < 0 || frame.respawnSeconds === 0) return null
  const { threat, nextItem, priorCases, counterItem } = options
  const support = role === 'Hard support' || role === 'Soft support'
  const lane = view?.phase === 'Laning' || (view == null && frame.clock < 600)
  const owned = frame.items
  const seconds = frame.respawnSeconds
  const defensiveTool = owned.includes('force_staff') ? 'Keep Force Staff ready and leave room to use it.'
    : owned.includes('glimmer_cape') && threat?.magic ? 'Use Glimmer Cape before their magic damage lands.'
    : owned.includes('black_king_bar') && threat?.ability && !threat.ability.x ? 'Activate Black King Bar before their disable lands.'
    : undefined
  const threatTip = threat?.ability ? threat.ability.x
    ? `Stay outside ${threat.ability.n} range until ${threat.name} uses it. Debuff immunity alone won’t stop it.`
    : `Wait for ${threat.name} to use ${threat.ability.n}, then commit with an ally.`
    : null
  const followUp = defensiveTool ?? (nextItem && frame.gold != null && frame.gold >= nextItem.cost
    ? `${nextItem.name} fits your current gold. Check buyback before buying it.`
    : counterItem ? `${counterItem.name} · ${counterItem.reason}`
    : threat?.magic && !owned.includes('glimmer_cape') && support && !lane ? 'Consider Glimmer Cape if you need a save against their magic damage.' : undefined)
  const evidence = threat?.confirmed ? `Killer you confirmed · ${threat.name}` : threat?.ability ? `Lineup threat · ${threat.name}` : undefined
  const detail = { seconds, threat: evidence, repeats: priorCases, followUp }
  if (threatTip) return { ...detail, title: 'Avoid the next catch', tip: threatTip }
  if (lane && support) return { ...detail, title: 'Rejoin your lane partner', tip: 'Return to the next wave together. Trade from allied vision and keep a retreat to your tower.' }
  if (lane) return { ...detail, title: 'Recover the next wave', tip: 'Take XP near your tower and ask for cover before contesting a rune or farming beyond vision.' }
  if (support) return { ...detail, title: 'Reconnect with an ally', tip: 'Bring detection or wards if needed. Set vision with a core who can follow up on your spells.' }
  if (role === 'Offlane') return { ...detail, title: 'Plan your next initiation', tip: 'Approach from allied vision. Wait until a teammate is in range to follow up.' }
  if (view?.gpmPct != null && view.gpmPct < 35) return { ...detail, title: 'Recover your farm', tip: 'Take a safe wave and nearby camps. Keep a teleport for a fight you can reach.' }
  return { ...detail, title: role === 'Mid' ? 'Pick your next rotation' : 'Choose a safe route', tip: 'Line up your teleport and next item purchase, and come back where an ally can back you up.' }
}
