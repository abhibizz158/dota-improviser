import type { GameType } from './model.js'
import type { Role } from './model.js'

// Fixed, publicly-documented map clock rules (rune spawns, the day/night cycle, creep-camp stack windows) —
// not read from the game, just the same clock math every player already keeps in their head, same category as
// the existing Roshan/Aegis stopwatch. Valve has changed these numbers before (bounty rune interval, stack
// windows have both moved across patches); treat every timing here as an estimate, same as Roshan/Aegis.
export type MapTimer = { id: string; label: string; sub?: string }

/** The next occurrence of a repeating `start, start+interval, start+2*interval, ...` schedule that falls in
 * the (before, after] window — fires exactly once as the clock crosses it, however big or small the tick. */
function crossing(before: number, after: number, start: number, interval: number | null): number | null {
  if (after < start) return null
  if (interval == null) return before < start && after >= start ? start : null
  let t = start
  for (let guard = 0; guard < 2000 && t <= after; guard++, t += interval) {
    if (t > before) return t
  }
  return null
}

const clockLabel = (seconds: number) => {
  const m = Math.floor(Math.abs(seconds) / 60), s = Math.abs(seconds) % 60
  return (seconds < 0 ? '-' : '') + m + ':' + String(s).padStart(2, '0')
}

/** `before`/`after` are the previous and current own-player GSI clock, in seconds (Turbo already time-scaled
 * the same way the rest of the app treats it). Returns at most the alerts that just became due. */
export function dueMapTimers(before: number, after: number, role: Role | null, mode: GameType | null): MapTimer[] {
  if (mode === 'Ability Draft' || after < 0) return []
  const turbo = mode === 'Turbo'
  const alerts: MapTimer[] = []
  const mid = role === 'Mid'
  const support = role === 'Soft support' || role === 'Hard support'

  // Water runes: river rune spots, one-time refill at 2:00 and 4:00 only (never repeat after).
  if (mid) for (const t of [120, 240]) {
    if (crossing(before, after, t, null) != null) alerts.push({ id: 'water-' + t, label: 'Water rune up', sub: 'River · one-time, both spots' })
  }
  // Power runes: river rune spots, 6:00 then every 2:00 after the water runes stop.
  if (mid) {
    const t = crossing(before, after, 360, turbo ? 90 : 120)
    if (t != null) alerts.push({ id: 'power-' + t, label: 'Power rune up', sub: 'River · ' + clockLabel(t) })
  }
  // Bounty runes: both jungles, 0:00 then every 4:00 — matters to the whole team's gold, not just mid.
  {
    const t = crossing(before, after, 0, turbo ? 150 : 240)
    if (t != null) alerts.push({ id: 'bounty-' + t, label: 'Bounty runes up', sub: 'Both jungles' })
  }
  // Day/night: 5 minutes each, alternating from Day at 0:00 — affects vision range for the rest of the cycle.
  {
    const t = crossing(before, after, 300, 300)
    if (t != null) alerts.push({ id: 'daynight-' + t, label: (Math.round(t / 300) % 2 === 1 ? 'Night falls' : 'Daybreak'), sub: 'Vision range changes' })
  }
  // Creep stacking: a heads-up 15s before each minute so a support can get into position — the actual pull
  // window (camp-specific, roughly the last 5-7s before the minute) still varies by camp and patch.
  if (support) {
    const t = crossing(before, after, 45, 60)
    if (t != null) alerts.push({ id: 'stack-' + t, label: 'Stack window soon', sub: 'Get to a camp — pull in the next ~15s' })
  }
  return alerts
}
