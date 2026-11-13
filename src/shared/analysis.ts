import type { Hero, MatchPlayer, MatchSummary, Matchups, Pace, Role } from './model.js'

export const average = (numbers: number[]) =>
  numbers.length ? numbers.reduce((sum, number) => sum + number, 0) / numbers.length : null

export const available = (values: (number | null | undefined)[]) => values.filter((value): value is number => value != null && Number.isFinite(value))

export function summarize(matches: MatchSummary[]) {
  const decisions = matches.filter((match) => match.won != null)
  const kda = average(matches.flatMap(({ kills, deaths, assists }) =>
    kills == null || deaths == null || assists == null ? [] : [(kills + assists) / Math.max(1, deaths)]))
  return {
    winRate: decisions.length ? decisions.filter((match) => match.won).length / decisions.length * 100 : null,
    gpm: average(available(matches.map((match) => match.gpm))),
    xpm: average(available(matches.map((match) => match.xpm))),
    lastHits: average(available(matches.map((match) => match.lastHits))),
    denies: average(available(matches.map((match) => match.denies))),
    kda,
  }
}

export function atMinute(player: MatchPlayer, minute: number) {
  return player.minutes.find((point) => point.time === minute * 60)
}

export function practicePace(matches: MatchPlayer[]): Pace[] {
  return ([5, 10] as const).flatMap((minute) => {
    const values = available(matches.map((match) => atMinute(match, minute)?.lastHits))
    const mean = average(values)
    return mean == null || values.length < 2 ? [] : [{ minute, lastHits: Math.round(mean), matches: values.length }]
  })
}

/** Signature hero: most played in your last `n` matches (ties broken by win rate), with its averages. */
export function featuredHero(matches: MatchSummary[], n = 30) {
  const recent = matches.slice(0, n)
  const by = new Map<number, MatchSummary[]>()
  for (const m of recent) by.set(m.heroId, [...(by.get(m.heroId) ?? []), m])
  const ranked = [...by.entries()].map(([heroId, rows]) => ({ heroId, rows, wr: summarize(rows).winRate ?? 0 }))
    .sort((a, b) => b.rows.length - a.rows.length || b.wr - a.wr)
  const top = ranked[0]
  if (!top) return null
  const s = summarize(top.rows)
  const minutes = top.rows.filter((m) => m.lastHits != null && m.duration > 0)
  return {
    heroId: top.heroId, games: top.rows.length, of: recent.length, wins: top.rows.filter((m) => m.won).length, ...s,
    lhpm: average(minutes.map((m) => m.lastHits! / (m.duration / 60))), rows: top.rows,
    others: ranked.slice(1, 3).map((r) => ({ heroId: r.heroId, games: r.rows.length, winRate: r.wr })),
  }
}

export const comparable = (reference: MatchSummary, candidate: MatchSummary) =>
  candidate.id !== reference.id && reference.heroId === candidate.heroId && reference.role !== null &&
  reference.role === candidate.role && reference.mode === candidate.mode && reference.side === candidate.side &&
  (!reference.patch || !candidate.patch || reference.patch === candidate.patch)

const roleTags: Record<Role, string[]> = {
  Carry: ['Carry'], Mid: ['Nuker', 'Escape'], Offlane: ['Durable', 'Initiator'],
  'Soft support': ['Support', 'Disabler'], 'Hard support': ['Support'],
}

export function roleFit(hero: Hero, role: Role) {
  return roleTags[role].some((tag) => hero.roles.includes(tag))
}

export function rankDraft(heroes: Hero[], role: Role, enemy: number[], allied: number[], pool: number[], matchups: Matchups) {
  const picked = new Set([...enemy, ...allied])
  return heroes.filter((hero) => !picked.has(hero.id) && (!pool.length || pool.includes(hero.id))).map((hero) => {
    const pairs = [...new Set(enemy)].flatMap((opponent) => {
      const record = matchups[opponent]?.find((candidate) => candidate.heroId === hero.id)
      return record && record.games >= 20 && record.wins >= 0 && record.wins <= record.games
        ? [{ opponent, games: record.games, wins: record.games - record.wins }] : []
    })
    const games = pairs.reduce((sum, pair) => sum + pair.games, 0)
    const wins = pairs.reduce((sum, pair) => sum + pair.wins, 0)
    const fit = roleFit(hero, role)
    return { hero, pairs, games, winRate: games ? 100 * wins / games : null, fit }
  }).sort((a, b) => Number(b.fit) - Number(a.fit) ||
    (b.winRate ?? -1) - (a.winRate ?? -1) || b.games - a.games || a.hero.name.localeCompare(b.hero.name))
}
