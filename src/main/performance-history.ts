import type { Frame, GameType, MatchPlayer } from '../shared/model.js'
import { performanceInterval } from '../shared/personal-performance.js'
import type { PerformanceMatch, PerformanceSample } from '../shared/personal-performance.js'
import { itemInfo } from './data.js'

function majorItem(key: string) {
  const item = itemInfo[key]
  return item && item.c >= 2000 && !item.q.includes('consumable')
}

export function livePerformanceSample(at: number, frame: Frame, seenItems: Record<string, number>): PerformanceSample {
  return { at, values: {
    gpm: frame.gpm ?? undefined, xpm: frame.xpm ?? undefined, lastHits: frame.lastHits ?? undefined,
    deaths: frame.deaths ?? undefined, level: frame.level ?? undefined,
    participation: frame.kills == null || frame.assists == null ? undefined : frame.kills + frame.assists,
    items: frame.itemsObserved ? Object.keys(seenItems).filter(majorItem).length : undefined,
  } }
}

export function reviewedPerformance(player: MatchPlayer): PerformanceMatch {
  const mode: GameType | null = player.mode === 'Turbo' ? 'Turbo' : /ability draft/i.test(player.mode) ? 'Ability Draft' :
    player.mode.startsWith('Ranked ') ? 'Ranked' : player.mode === 'All Pick' ? 'Normal' : player.mode ? 'Other' : null
  const items = player.events.filter((event) => event.kind === 'item' && event.key && event.time != null && majorItem(event.key))
  const samples = player.minutes.filter(({ time }) => time > 0 && time % performanceInterval === 0).map(({ time, gold, xp, lastHits, deaths }) => ({
    at: time, values: {
      gpm: gold == null ? undefined : Math.round(gold * 60 / time),
      xpm: xp == null ? undefined : Math.round(xp * 60 / time),
      lastHits: lastHits ?? undefined, deaths: deaths ?? undefined,
      items: player.purchasesAvailable ? new Set(items.filter((event) => event.time! <= time).map((event) => event.key)).size : undefined,
    },
  }))
  return { id: player.id, heroId: player.heroId, role: player.role, mode, samples }
}

export function combinePerformance(local: PerformanceMatch[], parsed: PerformanceMatch[]) {
  const parsedById = new Map(parsed.map((match) => [match.id, match]))
  const combined = local.map((match) => {
    if (match.id == null) return match
    const review = parsedById.get(match.id)
    parsedById.delete(match.id)
    if (!review) return match
    const byTime = new Map(review.samples.map((sample) => [sample.at, sample]))
    for (const sample of match.samples) byTime.set(sample.at, { at: sample.at, values: { ...byTime.get(sample.at)?.values, ...sample.values } })
    return { ...review, ...match, role: match.role ?? review.role, mode: match.mode ?? review.mode, samples: [...byTime.values()] }
  })
  return [...combined, ...parsedById.values()]
}
