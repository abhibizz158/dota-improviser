import type { Frame, GameType } from './model.js'
import type { CoachView } from './coach.js'
import type { TeamProfile } from './mechanics.js'

export type OutlookPoint = { at: number; win: number; lead: number | null }
export type MatchOutlook = {
  win: number; lead: number | null; scope: 'Lineup only' | 'Live team scores'; factors: string[]; points: OutlookPoint[];
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const logit = (p: number) => Math.log(p / (1 - p))

export function matchEstimate(input: {
  frame: Frame; draftWin: number | null; allies: TeamProfile | null; enemies: TeamProfile | null;
  mode: GameType | null; coach: CoachView | null
}): Omit<MatchOutlook, 'points'> | null {
  const { frame, draftWin, allies, enemies, mode, coach } = input
  if (frame.clock < 0) return null
  const { radiantScore, direScore } = frame
  const scored = radiantScore != null && direScore != null
  const lineupWin = mode === 'Ability Draft' ? null : draftWin
  if (!scored && lineupWin == null) return null

  const time = frame.clock * (mode === 'Turbo' ? 1.35 : 1)
  const prior = lineupWin == null ? 0 : logit(clamp(lineupWin / 100, 0.35, 0.65)) * (0.75 - 0.5 * Math.min(1, time / 2100))
  const lead = scored ? (radiantScore - direScore) * (frame.team === 'Radiant' ? 1 : -1) : null
  const totalKills = scored ? radiantScore + direScore : 0
  const live = lead == null ? 0 : clamp(lead / (3 + Math.sqrt(totalKills)) * (0.7 + 0.6 * Math.min(1, time / 1800)), -2, 2)
  const completeLineups = allies?.heroes === 5 && enemies?.heroes === 5 && mode !== 'Ability Draft'
  const scaling = completeLineups ? clamp((allies.carry - enemies.carry) / 6, -1, 1) * clamp((time - 900) / 1800, 0, 0.2) : 0
  const balance = completeLineups && time < 1800 ? clamp((allies.hard - enemies.hard) / 10, -1, 1) * 0.12 : 0
  const pace = scored && coach?.gpmPct != null && coach.xpmPct != null && time >= 300
    ? clamp((coach.gpmPct + coach.xpmPct - 100) / 1250, -0.08, 0.08) : 0
  const dead = scored && frame.alive === false && frame.respawnSeconds != null && time >= 600 ? -Math.min(0.12, frame.respawnSeconds / 500) : 0
  const win = Math.round(clamp(100 / (1 + Math.exp(-(prior + live + scaling + balance + pace + dead))), 8, 92))
  const factors = [
    lead == null ? null : lead === 0 ? 'Even team kills' : lead > 0 ? `+${lead} team kills` : `${lead} team kills`,
    lineupWin == null ? null : 'Revealed lineup',
    completeLineups ? (time >= 900 ? 'Scaling and team balance' : 'Team balance') : null,
    pace !== 0 ? 'Your GPM/XPM pace' : null,
    dead !== 0 ? 'Respawn downtime' : null,
  ].filter((factor): factor is string => factor !== null)
  return { win, lead, scope: scored ? 'Live team scores' : 'Lineup only', factors }
}

export function recordOutlook(points: OutlookPoint[], point: OutlookPoint, final = false): OutlookPoint[] {
  const last = points.at(-1)
  if (last && point.at < last.at) return points
  if (last && point.at - last.at < 15 && !final) return points
  return [...(last?.at === point.at ? points.slice(0, -1) : points), point].slice(-1500)
}

/** Require an observed team deficit below 50% at two consecutive chart samples, and a verified own win. */
export function comebackLow(points: OutlookPoint[], won: boolean | null) {
  if (!won) return null
  const behind = (point: OutlookPoint) => point.win < 50 && point.lead != null && point.lead < 0 && point.at >= 300
  let low: number | null = null
  for (let i = 1; i < points.length; i++) {
    const before = points[i - 1], after = points[i]
    if (after.at > before.at && after.at - before.at <= 30 && behind(before) && behind(after)) {
      low = Math.min(low ?? 50, before.win, after.win)
    }
  }
  return low
}
