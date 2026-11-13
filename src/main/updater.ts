import { mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { hostAllowed } from '../shared/guard.js'
import type { DataStatus } from '../shared/model.js'
import { PAR_ITEMS } from '../shared/coach.js'
import { stripTags } from '../shared/guide.js'
import { classify } from '../shared/mechanics.js'
import { catalog, itemIds } from './data.js'

const heroes = catalog.heroes

// Self-updating data. After a Dota patch the app refetches public OpenDota aggregates into userData/data,
// which then override the bundled seed/hero DB. Rate-limited (free tier 60 req/min) and cancellable.
const PCT = [0.1, 0.3, 0.5, 0.7, 0.9, 0.99] // OpenDota publishes 0.1..0.9 in 0.1 steps, plus 0.95 and 0.99
const METRICS = { gold_per_min: 'gpm', xp_per_min: 'xpm', last_hits_per_min: 'lhpm', kills_per_min: 'kpm', hero_damage_per_min: 'dpm' } as const
/** Valve herodata entry -> compact kit: stats, role levels, abilities tagged with the effects their text describes. */
function toKit(h: Json) {
  const clean = (t: unknown) => String(t ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const n = (k: string) => num(h[k])
  const abilities = rows(h.abilities).filter((a) => a.is_item !== true && !a.ability_is_granted_by_scepter && !a.ability_is_granted_by_shard && a.name_loc && clean(a.desc_loc)).slice(0, 6).map((a) => {
    const text = clean(a.desc_loc) + ' ' + clean(Array.isArray(a.notes_loc) ? a.notes_loc.join(' ') : a.notes_loc)
    const damage = num(a.damage)
    return { n: String(a.name_loc), u: a.type === 1, p: (BigInt(String(a.behavior ?? 0)) & 2n) === 2n, d: [1, 2, 4].includes(damage) ? damage : 0, x: a.immunity === 3, c: classify(text), m: Array.isArray(a.mana_costs) ? num(a.mana_costs[0]) : 0 }
  })
  return {
    s: { str: n('str_base'), strg: n('str_gain'), agi: n('agi_base'), agig: n('agi_gain'), int: n('int_base'), intg: n('int_gain'), attr: n('primary_attr'), hp: n('max_health'), hpr: n('health_regen'), mana: n('max_mana'), manar: n('mana_regen'),
      dmin: n('damage_min'), dmax: n('damage_max'), bat: n('attack_rate'), range: n('attack_range'), proj: n('projectile_speed'), armor: n('armor'), mr: n('magic_resistance'), ms: n('movement_speed'), turn: n('turn_rate'), sight: n('sight_range_day'), night: n('sight_range_night'), cx: n('complexity') },
    r: Array.isArray(h.role_levels) ? h.role_levels : [], a: abilities,
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
type Json = Record<string, unknown>

async function get(path_: string, cancel: { stop: boolean }): Promise<unknown> {
  const url = 'https://api.opendota.com/api' + path_
  if (!hostAllowed(url)) throw new Error('Blocked by network allowlist.')
  for (let attempt = 0; ; attempt++) {
    if (cancel.stop) throw new Error('Update cancelled.')
    const res = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'error' })
    if (res.status === 429 && attempt < 6) { await wait(15000); continue }
    if (!res.ok) throw new Error(path_ + ' returned HTTP ' + res.status)
    await wait(1100)
    return res.json()
  }
}
const asJson = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
const rows = (value: unknown): Json[] => Array.isArray(value) ? value.filter((v): v is Json => !!v && typeof v === 'object') : []
const num = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0
const top = (obj: unknown, n = 6): [string, number][] => Object.entries((obj ?? {}) as Record<string, number>)
  .flatMap(([id, c]) => itemIds.has(Number(id)) ? [[itemIds.get(Number(id))!, c] as [string, number]] : [])
  .sort((a, b) => b[1] - a[1]).slice(0, n)

async function atomic(file: string, value: unknown) {
  await writeFile(file + '.tmp', JSON.stringify(value))
  await rename(file + '.tmp', file)
}

export async function buildData(dir: string, report: (state: Pick<DataStatus, 'done' | 'total'>) => void, cancel: { stop: boolean }) {
  let total = heroes.length * 2 + 1
  let done = 0
  const tick = () => report({ done: ++done, total })
  const matchups: Record<number, [number, number, number][]> = {}
  for (const hero of heroes) {
    // wins = games hero won against enemy hero_id
    matchups[hero.id] = rows(await get('/heroes/' + hero.id + '/matchups', cancel))
      .filter((r) => num(r.games_played) >= 20).map((r) => [num(r.hero_id), num(r.games_played), num(r.wins)])
    tick()
  }
  const stats = rows(await get('/heroStats', cancel))
  tick()
  const db: Record<number, unknown> = {}
  for (const s of stats) {
    const id = num(s.id)
    if (!id) continue
    const bench = ((await get('/benchmarks?hero_id=' + id, cancel)) as { result?: Record<string, { percentile: number; value: number }[]> }).result ?? {}
    const items = (await get('/heroes/' + id + '/itemPopularity', cancel)) as Json
    db[id] = {
      pick: [1, 2, 3, 4, 5, 6, 7, 8].map((b) => num(s[b + '_pick'])), win: [1, 2, 3, 4, 5, 6, 7, 8].map((b) => num(s[b + '_win'])),
      pro: [num(s.pro_pick), num(s.pro_win), num(s.pro_ban)], turbo: [num(s.turbo_picks), num(s.turbo_wins)],
      bench: Object.fromEntries(Object.entries(METRICS).map(([key, short]) => [short, PCT.map((p) => bench[key]?.find((r) => Math.abs(r.percentile - p) < 0.001)?.value ?? null)])),
      items: { starting: top(items.start_game_items), early: top(items.early_game_items), mid: top(items.mid_game_items), late: top(items.late_game_items) },
    }
    tick()
  }
  // OpenDota item-timing win rates for the power-spike items each hero actually builds (drives coach achievement targets).
  const plan = Object.entries(db).flatMap(([id, h]) => {
    const items = h as { items: { early: [string, number][]; mid: [string, number][] } }
    return [...new Set([...items.items.early, ...items.items.mid].map(([k]) => k))].filter((k) => PAR_ITEMS.includes(k)).slice(0, 4).map((item) => [Number(id), item] as const)
  })
  total += plan.length
  const timings: Record<number, Record<string, [number, number, number][]>> = {}
  for (const [id, item] of plan) {
    const found = rows(await get('/scenarios/itemTimings?hero_id=' + id + '&item=' + item, cancel))
      .map((r) => [num(r.time), num(r.games), num(r.wins)] as [number, number, number]).filter(([t, g]) => t > 0 && g >= 5).sort((a, b) => a[0] - b[0])
    if (found.length >= 3) (timings[id] ??= {})[item] = found
    tick()
  }
  // Valve hero kits: stats, role levels and tagged abilities (what stuns, silences, pierces BKB...). dota2.com is not rate limited like OpenDota.
  total += heroes.length
  const kits: Record<number, unknown> = {}
  for (const hero of heroes) {
    if (cancel.stop) throw new Error('Update cancelled.')
    const url = 'https://www.dota2.com/datafeed/herodata?language=english&hero_id=' + hero.id
    if (!hostAllowed(url)) throw new Error('Blocked by network allowlist.')
    const res = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'error' })
    if (res.ok) {
      const h = rows(asJson(asJson((await res.json() as Json).result).data).heroes)[0]
      if (h && Array.isArray(h.role_levels)) kits[hero.id] = toKit(h)
    }
    await wait(450)
    tick()
  }
  const builtAt = Date.now()
  await mkdir(dir, { recursive: true })
  await atomic(path.join(dir, 'timings.json'), { builtAt, heroes: timings })
  await atomic(path.join(dir, 'kits.json'), { builtAt, heroes: kits })
  await atomic(path.join(dir, 'seed.json'), { patch: catalog.patch, builtAt, source: 'opendota', matchups })
  await atomic(path.join(dir, 'heroes.json'), { builtAt, patch: catalog.patch, percentiles: PCT, heroes: db })
  return builtAt
}

export type PatchChange = { patch: string; at: number; heroes: number[]; notes: Record<number, string[]> }

/** Valve's own patch-notes feed (dota2.com/datafeed): which heroes changed in the latest patches. Two small GETs per patch. */
export async function fetchPatchChanges(count = 6): Promise<PatchChange[]> {
  const base = 'https://www.dota2.com/datafeed/'
  const read = async (u: string) => {
    if (!hostAllowed(u)) throw new Error('Blocked by network allowlist.')
    const res = await fetch(u, { signal: AbortSignal.timeout(15000), redirect: 'error' })
    if (!res.ok) throw new Error(u + ' returned HTTP ' + res.status)
    return await res.json() as Json
  }
  const list = rows((await read(base + 'patchnoteslist?language=english')).patches)
    .map((p) => ({ patch: String(p.patch_number ?? ''), at: num(p.patch_timestamp) })).filter((p) => /^[0-9a-z.]+$/i.test(p.patch) && p.at > 0)
    .sort((a, b) => b.at - a.at).slice(0, count)
  const out: PatchChange[] = []
  for (const p of list) {
    const notes = await read(base + 'patchnotes?version=' + encodeURIComponent(p.patch) + '&language=english')
    const noteList = (h: Json) => [h.hero_notes, h.talent_notes, ...rows(h.abilities).map((a) => a.ability_notes)].flatMap((v) => rows(v).map((n) => stripTags(n.note))).filter(Boolean)
    const heroes = rows(notes.heroes).filter((h) => num(h.hero_id) > 0)
    out.push({ ...p, heroes: [...new Set(heroes.map((h) => num(h.hero_id)))], notes: Object.fromEntries(heroes.map((h) => [num(h.hero_id), noteList(h)])) })
  }
  return out
}
