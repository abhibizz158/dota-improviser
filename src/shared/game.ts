import type { Frame } from './model.js'

// Per-game dynamics from the player's OWN game feed only: your kill count, kill streak and the public team kill score.
// Tower/Roshan state is not in that feed (spectator-only), so it is covered post-match from the parsed replay instead.
export type GameEvent = { id: string; kind: 'first-blood' | 'multikill' | 'streak' | 'milestone' | 'item' | 'comeback' | 'alert' | 'summary'; label: string; sub?: string; epic?: boolean; at: number }
export type GameTrack = {
  kills: number | null; killTimes: number[]; chain: number; lastScore: [number, number] | null
  firstBlood: { team: 'Radiant' | 'Dire'; clock: number; you: boolean } | null
  lead: [number, number][]; multi: Record<string, number>; streakSeen: number; flags: Record<string, true>; lastSample: number; best: string | null
}
export const newTrack = (): GameTrack => ({ kills: null, killTimes: [], chain: 0, lastScore: null, firstBlood: null, lead: [], multi: {}, streakSeen: 0, flags: {}, lastSample: -999, best: null })

const MULTI: Record<number, string> = { 2: 'Double Kill', 3: 'Triple Kill', 4: 'Ultra Kill', 5: 'Rampage' }
const STREAK: [number, string][] = [[3, 'Killing Spree'], [4, 'Dominating'], [5, 'Mega Kill'], [6, 'Unstoppable'], [7, 'Wicked Sick'], [8, 'Monster Kill'], [9, 'Godlike'], [10, 'Beyond Godlike']]
const CHAIN_WINDOW = 18 // Dota: kills within 18 seconds of the previous one extend a multi-kill

export const multiRank = (name: string | null) => name ? Object.values(MULTI).indexOf(name) : -1

/** Feed one frame; returns events that just happened. Mutates the tracker. */
export function trackFrame(t: GameTrack, f: Frame): GameEvent[] {
  const events: GameEvent[] = []
  const push = (e: Omit<GameEvent, 'at'>) => events.push({ ...e, at: f.clock })
  const own = f.team === 'Radiant' ? f.radiantScore : f.direScore
  const enemy = f.team === 'Radiant' ? f.direScore : f.radiantScore
  const killDelta = t.kills != null && f.kills != null ? f.kills - t.kills : 0

  if (f.radiantScore != null && f.direScore != null) {
    const score: [number, number] = [f.radiantScore, f.direScore]
    if (t.lastScore && t.lastScore[0] + t.lastScore[1] === 0 && score[0] + score[1] > 0 && !t.firstBlood) {
      const team = score[0] > t.lastScore[0] ? 'Radiant' : 'Dire'
      const you = killDelta > 0
      t.firstBlood = { team, clock: f.clock, you }
      push({ id: 'first-blood', kind: 'first-blood', epic: you, label: you ? 'First Blood: you!' : team === f.team ? 'First Blood: your team' : 'First Blood: enemy team', sub: team + ' at ' + Math.floor(f.clock / 60) + ':' + String(f.clock % 60).padStart(2, '0') })
    }
    t.lastScore = score
    if (own != null && enemy != null && (f.clock - t.lastSample >= 30 || t.lead.at(-1)?.[1] !== own - enemy)) {
      t.lead.push([f.clock, own - enemy]); t.lastSample = f.clock
      if (t.lead.length > 500) t.lead.shift()
    }
  }

  if (killDelta > 0 && killDelta <= 5) {
    for (let i = 0; i < killDelta; i++) {
      const prev = t.killTimes.at(-1)
      t.chain = prev != null && f.clock - prev <= CHAIN_WINDOW ? t.chain + 1 : 1
      t.killTimes.push(f.clock)
      const name = MULTI[Math.min(5, t.chain)]
      if (t.chain >= 2 && name) {
        t.multi[name] = (t.multi[name] ?? 0) + 1
        if (multiRank(name) > multiRank(t.best)) t.best = name
        push({ id: 'multi-' + name, kind: 'multikill', label: name.toUpperCase(), sub: 'Kills chained within ' + CHAIN_WINDOW + 's', epic: t.chain >= 4 })
      }
    }
  }
  if (f.kills != null) t.kills = f.kills

  const streak = f.killStreak ?? 0
  if (streak < 3) t.streakSeen = 0
  for (const [n, label] of STREAK) if (streak >= n && n > t.streakSeen) { t.streakSeen = n; push({ id: 'streak-' + n, kind: 'streak', label: label.toUpperCase(), sub: n + ' kills without dying', epic: n >= 8 }) }

  const once = (key: string, cond: boolean, e: Omit<GameEvent, 'at'>) => { if (cond && !t.flags[key]) { t.flags[key] = true; push(e) } }
  once('no-death-10', f.clock >= 600 && f.deaths === 0, { id: 'no-death-10', kind: 'milestone', label: 'Untouched: no deaths by 10:00' })
  once('cs-60', f.clock >= 600 && (f.lastHits ?? 0) >= 60, { id: 'cs-60', kind: 'milestone', label: 'Strong lane: 60 last hits by 10:00' })
  return events
}

/** Last N points of the kill-lead series (your team minus theirs), thinned for display. */
export function momentum(t: GameTrack, n = 60) {
  return t.lead.slice(-n)
}
