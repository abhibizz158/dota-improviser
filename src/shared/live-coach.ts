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
 * progress is tracked separately). Works in any match type: ranked, normal, or practice. */
export function observeAchievement(previous: Frame | null, next: Frame, achievement: Achievement, awarded: Set<string>) {
  if (next.paused || next.heroId == null || next.clock < 0 || (previous && next.clock < previous.clock)) return null
  const id = next.heroId + ':' + achievement.id
  const happened = achievement.id === 'lh10' ? Boolean(previous) && previous!.clock < 600 && next.clock >= 600 :
    Boolean(previous?.itemsObserved) && next.itemsObserved && !previous!.items.includes(achievement.id) && achievement.got === next.clock
  if (achievement.state !== 'done' || !happened || awarded.has(id)) return null
  awarded.add(id)
  return { id, heroId: next.heroId, at: next.clock }
}

export type Recovery = { seconds: number | null; title: string; tip: string }

export function recoveryAdvice(frame: Frame, role: Role, view: CoachView | null, nextItem?: { name: string; cost: number }): Recovery | null {
  if (frame.alive || frame.clock < 600 || frame.paused || frame.respawnSeconds === 0) return null
  const seconds = frame.respawnSeconds
  if (nextItem && frame.gold != null && frame.gold >= nextItem.cost) {
    return { seconds, title: 'Your next item is affordable', tip: `Queue ${nextItem.name} from your saved build, then check which fight you can reach safely.` }
  }
  if (role === 'Hard support' || role === 'Soft support') {
    return { seconds, title: 'Reconnect with an ally', tip: role === 'Hard support' ? 'Restock detection or wards if your team needs them. Place vision with an ally after you respawn.' : 'Rejoin a core who can follow up on your spells. Check whether your team needs a save or initiation item next.' }
  }
  if (role === 'Offlane') return { seconds, title: 'Plan your next initiation', tip: 'Check who can follow up, then approach the next fight from allied vision.' }
  if (view?.gpmPct != null && view.gpmPct < 35) return { seconds, title: 'Recover your farm', tip: 'Start with a safe wave near your team and nearby camps. Keep a teleport ready for a fight you can reach.' }
  return { seconds, title: role === 'Mid' ? 'Pick your next rotation' : 'Choose a safe route', tip: 'Check your teleport and item timing before committing. Start on the side where your team can support you.' }
}
