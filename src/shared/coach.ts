import type { Frame, Role } from './model.js'
import type { HeroStats } from './brain.js'

export type HeroData = {
  pick: number[]; win: number[]; pro: [number, number, number]; turbo: [number, number]
  bench: Record<'gpm' | 'xpm' | 'lhpm' | 'kpm' | 'dpm', (number | null)[]>
  items: Record<'starting' | 'early' | 'mid' | 'late', [string, number][]>
}
export type HeroDb = { builtAt: number; patch: string; percentiles: number[]; heroes: Record<number, HeroData> }
export type Tip = { level: 'good' | 'warn' | 'info'; text: string; items?: string[] }
export type Achievement = { id: string; label: string; par: number; got: number | null; state: 'done' | 'late-done' | 'live' | 'missed'; elite: boolean }
/** item -> [bucket seconds, games, wins] from OpenDota scenarios/itemTimings for one hero. */
export type Timings = Record<string, [number, number, number][]>
export type TimingsDb = { builtAt: number; heroes: Record<number, Timings> }
export type CoachView = {
  heroId: number | null; score: number | null; gpm: number | null; xpm: number | null; lhpm: number | null
  gpmPct: number | null; xpmPct: number | null; lhPct: number | null; deaths: number | null
  tips: Tip[]; achievements: Achievement[]; benchmarkAvailable: boolean
  role: Role; phase: 'Laning' | 'Mid game' | 'Late game'; nextGoal: { label: string; left: number } | null
  stats: { kills: number | null; deaths: number | null; assists: number | null; lastHits: number | null; denies: number | null; level: number | null; gold: number | null }
  medians: { gpm: number | null; xpm: number | null; lhpm: number | null }
  planned?: { name: string; at: number | null }[]
  personal: { gpm: number; xpm: number; n: number } | null
}

// Par times (seconds) for common power spikes in a normal All Pick game. Shown only when the hero's own item data lists them.
const PAR: Record<string, [number, string]> = {
  power_treads: [420, 'Power Treads'], hand_of_midas: [480, 'Hand of Midas'], bfury: [600, 'Battle Fury'], maelstrom: [720, 'Maelstrom'],
  blink: [840, 'Blink Dagger'], force_staff: [840, 'Force Staff'], mekansm: [720, 'Mekansm'], glimmer_cape: [780, 'Glimmer Cape'],
  spirit_vessel: [840, 'Spirit Vessel'], pipe: [960, 'Pipe of Insight'], crimson_guard: [960, 'Crimson Guard'], black_king_bar: [1080, 'Black King Bar'],
  desolator: [960, 'Desolator'], manta: [1080, 'Manta Style'], radiance: [1080, 'Radiance'], diffusal_blade: [900, 'Diffusal Blade'],
  yasha: [780, 'Yasha'], echo_sabre: [660, 'Echo Sabre'], ultimate_scepter: [1200, "Aghanim's Scepter"], lotus_orb: [900, 'Lotus Orb'],
}
export const PAR_ITEMS = Object.keys(PAR)

/** Data-driven targets: par = latest timing bucket still winning 50%+, elite = latest still winning 60%+ (min 15 games per bucket). */
export function timingTargets(rows: [number, number, number][] | undefined) {
  const ok = (rows ?? []).filter(([, g]) => g >= 15).reverse()
  const par = ok.find(([, g, w]) => w / g >= 0.5)
  if (!par) return null
  const elite = ok.find(([, g, w]) => w / g >= 0.6)
  return { par: par[0], elite: elite?.[0] ?? null, winPct: Math.round(100 * par[2] / par[1]) }
}

const CORE: Role[] = ['Carry', 'Mid', 'Offlane']
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** Where `value` sits on a percentile ladder (linear interpolation), 0-100. */
export function percentileOf(value: number, ladder: (number | null)[], percentiles: number[]) {
  const pts = ladder.flatMap((v, i) => v == null ? [] : [[v, percentiles[i] * 100] as const])
  if (pts.length < 2) return null
  if (value <= pts[0][0]) return Math.max(1, pts[0][1] * value / Math.max(1, pts[0][0]))
  for (let i = 1; i < pts.length; i++) {
    if (value <= pts[i][0]) { const [v0, p0] = pts[i - 1], [v1, p1] = pts[i]; return p0 + (p1 - p0) * (value - v0) / Math.max(1e-9, v1 - v0) }
  }
  return Math.min(99.9, pts.at(-1)![1])
}

const clock = (t: number) => Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0')

/** `seen` = item -> first clock it appeared in your inventory (mutated; main resets it per match). */
export function coach(frame: Frame, data: HeroData | undefined, percentiles: number[], role: Role, seen: Record<string, number>, mine?: HeroStats, timings?: Timings): CoachView {
  for (const item of frame.items) if (!(item in seen) && frame.clock >= 0) seen[item] = frame.clock
  const minutes = frame.clock / 60
  const warm = minutes >= 4 // averages are noise before this
  const lhpm = frame.lastHits != null && minutes > 0 ? frame.lastHits / minutes : null
  const pct = (v: number | null, key: keyof HeroData['bench']) => warm && v != null && data ? percentileOf(v, data.bench[key], percentiles) : null
  const gpmPct = pct(frame.gpm, 'gpm'), xpmPct = pct(frame.xpm, 'xpm'), lhPct = pct(lhpm, 'lhpm')
  const core = CORE.includes(role)
  const parts = [[gpmPct, core ? 0.4 : 0.25], [xpmPct, core ? 0.3 : 0.45], [lhPct, core ? 0.3 : 0]] as const
  const weight = parts.reduce((s, [p, w]) => s + (p == null ? 0 : w), 0)
  const base = weight ? parts.reduce((s, [p, w]) => s + (p ?? 0) * w, 0) / weight : null
  const deaths = frame.deaths
  const excess = deaths == null ? 0 : Math.max(0, deaths - (2 + minutes / 8))
  const score = base == null ? null : Math.round(clamp(base - excess * 3, 0, 100))

  const tips: Tip[] = []
  const heroName = frame.heroSlug.replaceAll('_', ' ')
  if (minutes >= 3 && minutes < 10 && deaths != null && deaths >= 2) {
    tips.push({ level: 'warn', text: `${deaths} deaths before 10:00: switch to a defensive lane: take safe XP, skip low-health trades and ask your lane partner to help reset the wave.`, items: ['tango', 'magic_stick', 'healing_salve'] })
  } else if (minutes >= 4 && minutes < 10 && lhPct != null && lhPct < 25) {
    tips.push({ level: 'warn', text: 'Last-hit pace is low for this hero: protect health, take uncontested creeps and stay in experience range instead of forcing trades.', items: ['tango', 'infused_raindrops', 'magic_stick'] })
  }
  if (warm && data) {
    if (gpmPct != null && gpmPct < 30) tips.push({ level: 'warn', text: `GPM ${frame.gpm} is under the 30th percentile for ${heroName} (median ${Math.round(data.bench.gpm[2] ?? 0)}). Take more creep waves and camps.` })
    if (core && lhPct != null && lhPct < 30) tips.push({ level: 'warn', text: `Last hits are behind: ${lhpm!.toFixed(1)}/min vs median ${(data.bench.lhpm[2] ?? 0).toFixed(1)}. Prioritise lane CS over trading.` })
    if (xpmPct != null && xpmPct < 30) tips.push({ level: 'warn', text: `XPM ${frame.xpm} is low. Rotate into XP, stay near allies in fights.` })
    if (score != null && score >= 70) tips.push({ level: 'good', text: `Ahead of pace for ${heroName} (${score}/100). Convert it into objectives.` })
  }
  // Self-learned baseline: your own recent average on this hero (patch- and recency-weighted).
  if (mine && mine.n >= 3 && minutes >= 8 && frame.gpm != null) {
    if (frame.gpm < mine.gpm * 0.85) tips.push({ level: 'warn', text: `GPM ${frame.gpm} is below your own average on this hero (${Math.round(mine.gpm)}).` })
    else if (frame.gpm > mine.gpm * 1.1) tips.push({ level: 'good', text: `GPM ${frame.gpm} beats your usual ${Math.round(mine.gpm)} on this hero.` })
  }
  if (frame.gold != null && frame.gold >= 1500 && frame.alive) tips.push({ level: 'warn', text: `${frame.gold} gold unspent. Buy your next item or buyback fund.` })
  if (deaths != null && excess >= 1) tips.push({ level: 'warn', text: `${deaths} deaths is above pace. Play around vision and your escapes.` })
  if (!tips.length && data && minutes < 10) {
    const mid = data.items.mid.slice(0, 3).map(([k]) => PAR[k]?.[1] ?? k.replaceAll('_', ' ')).join(', ')
    if (mid) tips.push({ level: 'info', text: `Popular mid-game items for this hero: ${mid}.` })
  }

  const wanted = data ? [...data.items.early, ...data.items.mid].map(([k]) => k).filter((k, i, a) => PAR[k] && a.indexOf(k) === i).slice(0, 4) : []
  const achievements: Achievement[] = wanted.map((item) => {
    const learned = timingTargets(timings?.[item])
    const par = learned?.par ?? PAR[item][0]
    const got = seen[item] ?? null
    const state = got != null ? (got <= par ? 'done' : 'late-done') : frame.clock <= par ? 'live' : 'missed'
    return { id: item, label: `${PAR[item][1]} by ${clock(par)}${learned ? ` · ${learned.winPct}% wins` : ''}`, par, got, state, elite: got != null && learned?.elite != null && got <= learned.elite }
  })
  if (data?.bench.lhpm[2] != null) {
    const target = Math.round((data.bench.lhpm[3] ?? data.bench.lhpm[2]) * 10)
    const got = frame.clock >= 600 ? (seen.__lh10 ?? null) : null
    if (frame.clock >= 600 && !('__lh10' in seen)) seen.__lh10 = frame.lastHits ?? 0
    const hit = (seen.__lh10 ?? (frame.lastHits ?? 0)) >= target
    achievements.push({ id: 'lh10', label: `${target} last hits by 10:00`, par: 600, got, state: frame.clock >= 600 ? (hit ? 'done' : 'missed') : 'live', elite: false })
  }
  return { heroId: frame.heroId, score, gpm: frame.gpm, xpm: frame.xpm, lhpm, gpmPct, xpmPct, lhPct, deaths, tips: tips.slice(0, 3), achievements, benchmarkAvailable: Boolean(data),
    role, phase: frame.clock < 600 ? 'Laning' : frame.clock < 1500 ? 'Mid game' : 'Late game',
    nextGoal: (() => { const g = achievements.filter((a) => a.state === 'live' && a.par > frame.clock).sort((a, b) => a.par - b.par)[0]; return g ? { label: g.label, left: g.par - frame.clock } : null })(),
    stats: { kills: frame.kills, deaths: frame.deaths, assists: frame.assists, lastHits: frame.lastHits, denies: frame.denies, level: frame.level, gold: frame.gold },
    medians: { gpm: data?.bench.gpm[2] ?? null, xpm: data?.bench.xpm[2] ?? null, lhpm: data?.bench.lhpm[2] ?? null },
    personal: mine && mine.n >= 3 ? { gpm: Math.round(mine.gpm), xpm: Math.round(mine.xpm), n: Math.round(mine.n) } : null }
}
