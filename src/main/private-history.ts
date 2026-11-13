import type { MatchSummary } from '../shared/model.js'
import { catalog } from './data.js'

export const localHistoryKey = (account: string) => 'local-history:' + account

// An intentionally small format for player-provided, completed scoreboard rows.
export function parsePrivateHistory(value: unknown) {
  if (typeof value !== 'string' || value.length > 16000) throw new Error('Paste up to 20 completed matches.')
  const lines = value.trim().split(/\r?\n/).filter((line) => line.trim())
  if (/^match[_ ]?id[\t,]/i.test(lines[0] ?? '')) lines.shift()
  if (!lines.length || lines.length > 20) throw new Error('Paste between 1 and 20 completed matches.')
  const matches: MatchSummary[] = []
  for (const [index, line] of lines.entries()) {
    const fail = () => new Error('Check match row ' + (index + 1) + ' against the format shown above.')
    const fields = line.split(line.includes('\t') ? '\t' : ',').map((field) => field.trim())
    const [id, hero, side, result, date, duration, kills, deaths, assists, gpm, xpm, lastHits, denies] = fields
    if (!/^[1-9]\d{5,14}$/.test(id) || matches.some((row) => row.id === id) || fields.length < 5 || fields.length > 13) throw fail()
    const heroId = catalog.heroes.find((h) => String(h.id) === hero || h.name.toLowerCase() === hero.toLowerCase())?.id
    const team = /^(radiant|dire)$/i.test(side) ? (side.toLowerCase() === 'radiant' ? 'Radiant' : 'Dire') : null
    const won = !result ? null : /^(w|win|victory)$/i.test(result) ? true : /^(l|loss|defeat)$/i.test(result) ? false : undefined
    const start = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(date) / 1000 : NaN
    const stat = (field?: string) => {
      if (!field) return null
      if (!/^\d{1,6}$/.test(field)) throw fail()
      return Number(field)
    }
    if (!heroId || !team || won === undefined || !Number.isFinite(start) || new Date(start * 1000).toISOString().slice(0, 10) !== date || start > Date.now() / 1000) throw fail()
    matches.push({ id, heroId, side: team, won, start, duration: stat(duration) ?? 0, kills: stat(kills), deaths: stat(deaths),
      assists: stat(assists), gpm: stat(gpm), xpm: stat(xpm), lastHits: stat(lastHits), denies: stat(denies), patch: '', mode: '', role: null, source: 'local' })
  }
  return matches
}

export function mergeHistory(remote: MatchSummary[], local: MatchSummary[]) {
  const merged = new Map(remote.map((row) => [row.id, row]))
  for (const row of local) {
    const previous = merged.get(row.id)
    merged.set(row.id, previous ? { ...row, ...previous, kills: previous.kills ?? row.kills, deaths: previous.deaths ?? row.deaths,
      assists: previous.assists ?? row.assists, gpm: previous.gpm ?? row.gpm, xpm: previous.xpm ?? row.xpm,
      lastHits: previous.lastHits ?? row.lastHits, denies: previous.denies ?? row.denies, won: previous.won ?? row.won } : row)
  }
  return [...merged.values()].sort((a, b) => b.start - a.start || Number(b.id) - Number(a.id))
}
