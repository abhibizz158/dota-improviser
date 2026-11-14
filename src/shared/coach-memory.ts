import type { Frame, GameType, Role } from './model.js'

export type Scenario = {
  patch: string; frame: Frame | null; hero: number | null; role: Role; mode: GameType | null;
  allies: number[]; enemies: number[]; killer: number | null; plan: string[]; phase?: string;
}

export function scenarioKey({ patch, frame, hero, role, mode, allies, enemies, killer, plan, phase }: Scenario) {
  const ordered = (ids: number[]) => ids.slice().sort((a, b) => a - b)
  const band = (value: number | null, step: number) => value == null ? null : Math.floor(value / step)
  return JSON.stringify([
    patch, hero, role, mode, ordered(allies), ordered(enemies), killer, plan, phase,
    frame && [frame.matchmaking, frame.alive, band(frame.clock, 180), band(frame.gold, 500), band(frame.gpm, 75),
      band(frame.xpm, 100), frame.kills, frame.deaths, frame.assists, band(frame.lastHits, 15), frame.level, frame.items.slice().sort()],
  ])
}

export type CoachAnswer = { key: string; answer: string; at: number }
export function findCoachAnswer(records: CoachAnswer[], key: string, now: number) {
  return records.find((entry) => entry.key === key && now - entry.at < 30 * 86400000)?.answer
}

export function saveCoachAnswer(records: CoachAnswer[], entry: CoachAnswer) {
  return [entry, ...records.filter((record) => record.key !== entry.key)].slice(0, 60)
}

export function deathScenarioKey(scenario: Scenario) {
  // Accumulate repeated problems within the same phase, even when incidental KDA changes.
  const { frame } = scenario
  return JSON.stringify([
    scenario.patch, scenario.hero, scenario.role, scenario.mode, scenario.phase, scenario.killer,
    ...[scenario.allies, scenario.enemies].map((ids) => ids.slice().sort((a, b) => a - b)),
    frame?.matchmaking, frame?.items.slice().sort(), frame?.gpm == null ? null : Math.floor(frame.gpm / 150),
  ])
}

export type DeathCase = { key: string; at: number; times: number }
export function recordDeathCase(records: DeathCase[], key: string, at: number) {
  const previous = records.find((entry) => entry.key === key)
  return [{ key, at, times: (previous?.times ?? 0) + 1 }, ...records.filter((entry) => entry.key !== key)].slice(0, 100)
}
