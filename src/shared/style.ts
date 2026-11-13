import type { Hero, MatchSummary, Role } from './model.js'

// Playstyle learned from your recent matches: role mix, farm, fight, death and game-length behaviour.
export type Archetype = 'Hard Carry' | 'Tempo Core' | 'Frontline Initiator' | 'Dynamic Support' | 'Utility Support'
export type StyleScore = { name: string; score: number; desc: string }
export type StyleProfile = {
  primary: StyleScore; secondary: StyleScore | null; traits: StyleScore[]; archetypes: StyleScore[]
  metrics: { games: number; lhpm: number; gpm: number; fightPm: number; deathsPm: number; assistShare: number; avgMinutes: number; longEdge: number | null }
  advice: string[]
}

const clamp = (x: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, x))
const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
const DESC: Record<Archetype, string> = {
  'Hard Carry': 'Farms hard and wins late through item power.',
  'Tempo Core': 'Takes space in the mid game and converts tempo into kills.',
  'Frontline Initiator': 'Starts fights, absorbs damage and creates space.',
  'Dynamic Support': 'Roams, rotates and fights early; assist-heavy with moderate farm.',
  'Utility Support': 'Enables the team with vision, sustain and spells at low farm.',
}
const ADVICE: Record<Archetype, string[]> = {
  'Hard Carry': ['Prioritise safe farm and item timings; fight only when your core item is up.', 'Track your last hits at 10:00: it is your best early predictor.'],
  'Tempo Core': ['Hit level 6 and your first power item before rotating.', 'Rune control and timing pushes win you games: look at the clock every 2 minutes.'],
  'Frontline Initiator': ['Take the first fight on your terms: buy Blink or Force and watch their cooldowns.', 'Fewer deaths in the first 15 minutes means more tower pressure.'],
  'Dynamic Support': ['Rotate after the first wave of your lane is secured, and ping your cores before you leave.', 'Your assists matter more than kills: pick fights your cores can follow.'],
  'Utility Support': ['Keep wards up before each Roshan window and carry a Dust or Sentry.', 'Spend gold on team items early: your farm is the team\'s tempo.'],
}

/** Weighted over recent matches; needs 5+ with stats for a confident read. */
export function classifyStyle(matches: MatchSummary[], heroes: Hero[], n = 40): StyleProfile | null {
  const rows = matches.slice(0, n).filter((m) => m.duration >= 600 && m.lastHits != null && m.gpm != null && m.kills != null && m.assists != null && m.deaths != null)
  if (rows.length < 5) return null
  const mins = (m: MatchSummary) => m.duration / 60
  const lhpm = avg(rows.map((m) => m.lastHits! / mins(m)))
  const gpm = avg(rows.map((m) => m.gpm!))
  const fightPm = avg(rows.map((m) => (m.kills! + m.assists!) / mins(m)))
  const deathsPm = avg(rows.map((m) => m.deaths! / mins(m)))
  const share = (m: MatchSummary) => (m.kills! + m.assists!) ? m.assists! / (m.kills! + m.assists!) : 0
  const assistShare = avg(rows.map(share))
  const avgMinutes = avg(rows.map(mins))
  const role = (r: Role) => rows.filter((m) => m.role === r).length / rows.length
  const tag = (m: MatchSummary, t: string) => heroes.find((h) => h.id === m.heroId)?.roles.includes(t) ? 1 : 0
  const carryTag = avg(rows.map((m) => tag(m, 'Carry'))), suppTag = avg(rows.map((m) => tag(m, 'Support')))

  const raw: Record<Archetype, number> = {
    'Hard Carry': role('Carry') * 55 + clamp((lhpm - 4) * 8) * 0.25 + carryTag * 20,
    'Tempo Core': role('Mid') * 60 + clamp(fightPm * 60) * 0.15 + clamp((lhpm - 3) * 8) * 0.15,
    'Frontline Initiator': role('Offlane') * 60 + clamp((assistShare - 0.4) * 120) * 0.2 + tag(rows[0], 'Initiator') * 10,
    'Dynamic Support': role('Soft support') * 60 + clamp((assistShare - 0.55) * 200) * 0.25 + (lhpm < 3.5 ? 15 : 0),
    'Utility Support': role('Hard support') * 60 + clamp((380 - gpm) / 2) * 0.25 + suppTag * 15,
  }
  const archetypes = (Object.keys(raw) as Archetype[]).map((name) => ({ name, score: Math.round(clamp(raw[name])), desc: DESC[name] })).sort((a, b) => b.score - a.score)

  const decisive = rows.filter((m) => m.won != null)
  const rate = (xs: MatchSummary[]) => xs.length >= 4 ? xs.filter((m) => m.won).length / xs.length : null
  const longR = rate(decisive.filter((m) => mins(m) >= 38)), shortR = rate(decisive.filter((m) => mins(m) < 30))
  const longEdge = longR != null && shortR != null ? Math.round((longR - shortR) * 100) : null
  const traits: StyleScore[] = [
    { name: 'Endurance', score: Math.round(clamp(((longEdge ?? 0) + 10) * 3 + (avgMinutes - 32) * 3)), desc: longEdge != null && longEdge > 0 ? 'You win more as games go long.' : 'You close games out earlier than you grind them.' },
    { name: 'Aggression', score: Math.round(clamp(fightPm * 55)), desc: 'Kills and assists per minute: how often you are in the fight.' },
    { name: 'Survival', score: Math.round(clamp(100 - deathsPm * 260)), desc: 'Fewer deaths per minute means more map time and farm.' },
    { name: 'Farm focus', score: Math.round(clamp(lhpm * 11)), desc: 'Last hits per minute across your recent games.' },
  ].sort((a, b) => b.score - a.score)

  const primary = archetypes[0]
  return {
    primary, secondary: archetypes[1].score >= 25 ? archetypes[1] : null, traits, archetypes,
    metrics: { games: rows.length, lhpm, gpm, fightPm, deathsPm, assistShare, avgMinutes, longEdge },
    advice: [...ADVICE[primary.name as Archetype], traits[0].name === 'Endurance' && traits[0].score >= 60 ? 'You scale well: avoid risky early trades and play for the late game.' : traits[0].name === 'Aggression' && traits[0].score >= 60 ? 'You thrive in fights: set the tempo early before the enemy farms up.' : 'Keep your deaths low in the first 15 minutes to protect your tempo.'],
  }
}
