import type { GameType, Role } from './model.js'

export const performanceInterval = 300
const minSamples = 3
export type Metric = 'gpm' | 'xpm' | 'lastHits' | 'deaths' | 'level' | 'participation' | 'items'
export type PerformanceSample = { at: number; values: Partial<Record<Metric, number>> }
export type PerformanceMatch = { id: string | null; heroId: number; role: Role | null; mode: GameType | 'Practice' | null; samples: PerformanceSample[] }
export type PerformancePoint = { at: number; score: number | null; matches: number; metrics: { key: Metric; score: number; matches: number }[] }
export type PersonalPerformance = { points: PerformancePoint[] }

const weights: Record<Role, Record<Metric, number>> = {
  Carry: { gpm: 25, xpm: 15, lastHits: 20, deaths: 12, level: 8, participation: 5, items: 15 },
  Mid: { gpm: 20, xpm: 22, lastHits: 13, deaths: 12, level: 10, participation: 10, items: 13 },
  Offlane: { gpm: 17, xpm: 20, lastHits: 13, deaths: 15, level: 10, participation: 13, items: 12 },
  'Soft support': { gpm: 12, xpm: 20, lastHits: 4, deaths: 17, level: 10, participation: 23, items: 14 },
  'Hard support': { gpm: 10, xpm: 20, lastHits: 3, deaths: 18, level: 10, participation: 26, items: 13 },
}

export function checkpointAt(previous: number | null, next: number, paused: boolean) {
  const at = Math.floor(next / performanceInterval) * performanceInterval
  return !paused && previous != null && at > 0 && previous < at && next - previous <= 12 && next - at <= 8 ? at : null
}

export function comparePerformance(samples: PerformanceSample[], history: PerformanceMatch[], current: Omit<PerformanceMatch, 'samples'> & { role: Role }): PersonalPerformance {
  const roleWeights = weights[current.role]
  const previous = history.filter((match) => (current.id == null || match.id !== current.id) && (current.mode == null || current.mode === match.mode))
  return { points: samples.map(({ at, values }) => {
    const candidates = previous.flatMap((match) => {
      const sample = match.samples.find((point) => point.at === at)
      return sample ? [{ match, sample }] : []
    })
    const used = new Set<PerformanceMatch>()
    let weight = 0, total = 0
    const metrics: PerformancePoint['metrics'] = []
    for (const key of Object.keys(roleWeights) as Metric[]) {
      const value = values[key]
      if (value == null) continue
      const comparable = candidates.filter(({ match, sample }) => sample.values[key] != null &&
        (key === 'items' || key === 'level' ? match.heroId === current.heroId && match.role === current.role :
          match.role === current.role || (match.role == null && match.heroId === current.heroId)))
      const sameHero = comparable.filter(({ match }) => match.heroId === current.heroId)
      const cohort = sameHero.length >= minSamples ? sameHero : comparable
      if (cohort.length < minSamples) continue
      let better = 0
      for (const { match, sample } of cohort) {
        const difference = value - sample.values[key]!
        better += difference === 0 ? 0.5 : Number(key === 'deaths' ? difference < 0 : difference > 0)
        used.add(match)
      }
      const score = 100 * better / cohort.length
      weight += roleWeights[key]
      total += score * roleWeights[key]
      metrics.push({ key, score: Math.round(score), matches: cohort.length })
    }
    return { at, score: metrics.length >= 2 ? Math.round(total / weight) : null, matches: used.size, metrics }
  }) }
}
