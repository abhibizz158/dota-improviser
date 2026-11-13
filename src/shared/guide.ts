import type { Hero } from './model.js'
import type { HeroData, HeroDb, Tip, TimingsDb } from './coach.js'
import type { Seed } from './brain.js'
import type { Kit, KitsDb, MechModel } from './mechanics.js'
import { timingTargets } from './coach.js'

export type Ability = { name: string; desc: string; cooldown: string; mana: string }
export type HeroInfo = {
  hype: string; bio: string; primary: string; complexity: number
  attackRange: number; moveSpeed: number; armor: number; health: number; mana: number; damage: [number, number]; attackRate: number
  sightDay: number; sightNight: number; magicResist: number; abilities: Ability[]
}
export type LaneRow = { lane: 'Safe' | 'Mid' | 'Off' | 'Jungle'; games: number; wins: number }
export type DurationRow = { minute: number; games: number; wins: number }
export type PatchNote = { patch: string; at: number; notes: string[] }
export type HeroGuide = { id: number; info: HeroInfo | null; lanes: LaneRow[]; durations: DurationRow[]; patches: PatchNote[] }
export type Matchup = { enemy: number; rate: number; games: number }
export type Support = { matchups: Matchup[]; tips: Tip[] }

export const stripTags = (text: unknown) => typeof text === 'string' ? text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : ''
const pct = (w: number, g: number) => g ? Math.round(100 * w / g) : 0

/** Professional-style guide lines derived from public data: lane, game length, item spikes, complexity, range. */
export function guideTips(guide: HeroGuide, data?: HeroData, timings?: TimingsDb['heroes'][number], itemName: (k: string) => string = (k) => k): string[] {
  const tips: string[] = []
  const lanes = [...guide.lanes].filter((l) => l.games >= 30).sort((a, b) => b.games - a.games)
  const total = lanes.reduce((s, l) => s + l.games, 0)
  if (lanes[0]) {
    tips.push(`Most played from the ${lanes[0].lane.toLowerCase()} lane (${pct(lanes[0].games, total)}% of games, ${pct(lanes[0].wins, lanes[0].games)}% wins).`)
    const best = [...lanes].sort((a, b) => b.wins / b.games - a.wins / a.games)[0]
    if (best.lane !== lanes[0].lane && best.wins / best.games > lanes[0].wins / lanes[0].games + 0.02) tips.push(`Wins more from the ${best.lane.toLowerCase()} lane (${pct(best.wins, best.games)}%): worth trying.`)
  }
  const d = guide.durations.filter((x) => x.games >= 30)
  const windows: [string, (m: number) => boolean][] = [['under 30 min', (m) => m < 30], ['30 to 45 min', (m) => m >= 30 && m < 45], ['over 45 min', (m) => m >= 45]]
  const rated = windows.flatMap(([label, test]) => {
    const rows = d.filter((x) => test(x.minute)); const g = rows.reduce((s, x) => s + x.games, 0); const w = rows.reduce((s, x) => s + x.wins, 0)
    return g >= 100 ? [{ label, g, rate: w / g }] : []
  })
  if (rated.length > 1) { const best = [...rated].sort((a, b) => b.rate - a.rate)[0]; tips.push(`Strongest in games ${best.label} (${Math.round(best.rate * 100)}% wins): ${best.label === 'under 30 min' ? 'press your early advantage and close out' : best.label === 'over 45 min' ? 'scale safely and avoid risky early fights' : 'aim to hit your core items by 25 minutes'}.`) }
  if (data) {
    const mid = data.items.mid.slice(0, 3).map(([k]) => itemName(k))
    if (mid.length) tips.push(`Popular core path: ${data.items.early.slice(0, 2).map(([k]) => itemName(k)).join(', ') || 'boots'} then ${mid.join(', ')}.`)
  }
  for (const [item, rows] of Object.entries(timings ?? {}).slice(0, 2)) {
    const t = timingTargets(rows)
    if (t) tips.push(`${itemName(item)} pays off when bought by ${Math.floor(t.par / 60)}:${String(t.par % 60).padStart(2, '0')} (${t.winPct}% wins).`)
  }
  const info = guide.info
  if (info) {
    tips.push(info.attackRange > 200 ? `Ranged (${info.attackRange}): harass on cooldown, stay out of creep aggro range and deny when contested.` : `Melee: pull creep aggro to trade safely and look for free last hits when the enemy is forced back.`)
    tips.push(info.complexity <= 1 ? 'Low complexity: focus on map awareness and item timings.' : info.complexity >= 3 ? 'High complexity: practise combos in a bot match first, then take it into ranked.' : 'Medium complexity: learn the main combo, then add situational spells.')
  }
  return tips
}

const SLUGS = {
  invis: ['riki', 'bounty_hunter', 'clinkz', 'nyx_assassin', 'mirana', 'invoker', 'treant', 'weaver', 'slark', 'broodmother', 'sand_king', 'templar_assassin'],
  evasion: ['phantom_assassin', 'windrunner', 'brewmaster'],
  healers: ['necrolyte', 'dazzle', 'omniknight', 'oracle', 'huskar', 'alchemist', 'legion_commander', 'life_stealer'],
}

/** Item/play advice against the revealed enemy lineup. Tag-based, so it stays correct across patches. */
export function counterTips(enemy: number[], heroes: Hero[]): Tip[] {
  const team = enemy.flatMap((id) => heroes.find((h) => h.id === id) ?? [])
  const count = (tag: string) => team.filter((h) => h.roles.includes(tag)).length
  const named = (list: string[]) => team.filter((h) => list.includes(h.slug)).map((h) => h.name)
  const tips: Tip[] = []
  if (team.length < 2) return tips
  const invis = named(SLUGS.invis); if (invis.length) tips.push({ level: 'warn', text: `Stealth threat (${invis.join(', ')}): carry Dust or Sentries and stay near supports.`, items: ['dust', 'ward_sentry', 'gem'] })
  const evasion = named(SLUGS.evasion); if (evasion.length) tips.push({ level: 'warn', text: `Evasion (${evasion.join(', ')}): Monkey King Bar or Bloodthorn beats misses.`, items: ['monkey_king_bar', 'bloodthorn'] })
  const heal = named(SLUGS.healers); if (heal.length) tips.push({ level: 'info', text: `Sustain (${heal.join(', ')}): Spirit Vessel cuts healing, so focus them first.`, items: ['spirit_vessel'] })
  if (count('Disabler') >= 2) tips.push({ level: 'warn', text: `${count('Disabler')} disablers: time Black King Bar or Linken's before the first big fight.`, items: ['black_king_bar', 'sphere'] })
  if (count('Nuker') >= 2) tips.push({ level: 'warn', text: `${count('Nuker')} nukers: Hood of Defiance or Pipe, and keep Magic Stick charged.`, items: ['hood_of_defiance', 'pipe', 'magic_stick'] })
  if (count('Escape') >= 2) tips.push({ level: 'info', text: 'Slippery lineup: Orchid, Gleipnir or Hex finish targets that blink away.', items: ['orchid', 'gungir', 'sheepstick'] })
  if (count('Carry') >= 2) tips.push({ level: 'info', text: 'Several carries: Ghost Scepter, Halberd or Shiva\'s depending on their damage type.', items: ['ghost', 'heavens_halberd', 'shivas_guard'] })
  if (count('Initiator') >= 2) tips.push({ level: 'info', text: 'Strong initiation: group up, buy Force Staff or Glimmer Cape, never walk alone.', items: ['force_staff', 'glimmer_cape'] })
  return tips.slice(0, 4)
}

/** Your hero vs each revealed enemy, from the pair table. Rates shrink toward 50% on small samples. */
export function matchupRows(heroId: number, enemy: number[], index: Map<number, Map<number, [number, number]>>): Matchup[] {
  return [...new Set(enemy)].flatMap((e) => {
    const row = index.get(heroId)?.get(e)
    return row ? [{ enemy: e, games: row[0], rate: 100 * (row[1] + 75) / (row[0] + 150) }] : []
  }).sort((a, b) => a.rate - b.rate)
}

export function laneAdvice(rows: Matchup[], name: (id: number) => string): Tip[] {
  const worst = rows[0], best = rows.at(-1)
  const tips: Tip[] = []
  if (worst && worst.rate < 48) tips.push({ level: 'warn', text: `Respect ${name(worst.enemy)}: you win ${worst.rate.toFixed(0)}% against them. Trade less and let your lane partner take space.` })
  if (best && best.rate > 52 && best !== worst) tips.push({ level: 'good', text: `Pressure ${name(best.enemy)}: you win ${best.rate.toFixed(0)}% against them. Take the early trades.` })
  return tips
}

/** Overall win rate per hero (0..1) from the rank buckets of the hero database. */
export function baseWinRates(db: HeroDb | null): Record<number, number> {
  const out: Record<number, number> = {}
  for (const [id, h] of Object.entries(db?.heroes ?? {})) {
    const picks = h.pick.reduce((a, b) => a + b, 0)
    if (picks >= 500) out[Number(id)] = h.win.reduce((a, b) => a + b, 0) / picks
  }
  return out
}

export const roleLevels = (db: KitsDb | null): Record<number, number[]> => Object.fromEntries(Object.entries(db?.heroes ?? {}).map(([id, h]) => [Number(id), h.r]))

/** Popular items for the slot, by game phase, as item keys. */
export function buildFor(data: HeroData | undefined) {
  const names = (rows: [string, number][] | undefined, n: number) => (rows ?? []).slice(0, n).map(([k]) => k)
  return data ? { early: names(data.items.early, 3), mid: names(data.items.mid, 3), late: names(data.items.late, 3) } : undefined
}

/** Strong/weak-against lists and benchmark data for one hero, from the pair table. Shared by the desktop app and the browser preview. */
export function heroDetailFrom(id: number, seedIdx: Map<number, Map<number, [number, number]>>, db: HeroDb | null, base: Record<number, number>, kits: KitsDb | null = null, mech: MechModel | null = null) {
  const b = (x: number) => base[x] ?? 0.5
  const rows = [...(seedIdx.get(id) ?? new Map<number, [number, number]>()).entries()].filter(([, [g]]) => g >= 60).map(([heroId, [g, w]]) => {
    const expected = Math.min(0.65, Math.max(0.35, 0.5 + b(id) - b(heroId)))
    return { heroId, games: g, rate: 100 * (w + 120 * expected) / (g + 120), edge: 100 * ((w + 120 * expected) / (g + 120) - expected) }
  }).sort((a, c) => c.edge - a.edge)
  // Mechanical matchups: what the game's rules alone say, over every other hero (works even for heroes with little match data).
  const rules = mech ? Object.keys(kits?.heroes ?? {}).map(Number).filter((e) => e !== id).map((e) => ({ heroId: e, ...mech.predict(id, e) })).sort((a, c) => c.edge - a.edge) : []
  const pack = (r: (typeof rules)[number]) => ({ heroId: r.heroId, edge: r.edge, parts: r.parts.slice(0, 3) })
  return {
    id, data: db?.heroes[id] ?? null, patch: db?.patch ?? '', percentiles: db?.percentiles ?? [], base: base[id] != null ? base[id] * 100 : null, strongAgainst: rows.filter((r) => r.edge > 0).slice(0, 8), weakAgainst: rows.filter((r) => r.edge < 0).slice(-8).reverse(),
    kit: (kits?.heroes[id] ?? null) as Kit | null, mechStrong: rules.slice(0, 6).map(pack), mechWeak: rules.slice(-6).reverse().map(pack),
    model: mech ? { r2: mech.r2, samples: mech.samples, importance: mech.importance } : null,
  }
}
