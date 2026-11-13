// Builds data/heroes.json from OpenDota public aggregates: pick/win by bracket, pro + turbo stats,
// per-hero benchmark percentiles (gpm/xpm/last hits/kills/damage per minute) and item stages.
// Run: npm run data (≈5 min, OpenDota free tier is 60 req/min). Re-run after each Dota patch.
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

const constants = createRequire(import.meta.url)('dotaconstants')
const itemKey = new Map(Object.entries(constants.items).map(([key, item]) => [item.id, key]))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function get(path) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('https://api.opendota.com/api' + path, { signal: AbortSignal.timeout(20000) })
    if (res.status === 429 && attempt < 6) { await wait(15000); continue }
    if (!res.ok) throw new Error(path + ' HTTP ' + res.status)
    await wait(1100)
    return res.json()
  }
}
const PCT = [0.1, 0.3, 0.5, 0.7, 0.9, 0.99] // OpenDota only publishes 0.1..0.9 in steps of 0.1, plus 0.95 and 0.99
const METRICS = { gold_per_min: 'gpm', xp_per_min: 'xpm', last_hits_per_min: 'lhpm', kills_per_min: 'kpm', hero_damage_per_min: 'dpm' }
const top = (obj, n = 6) => Object.entries(obj ?? {}).flatMap(([id, c]) => itemKey.has(Number(id)) ? [[itemKey.get(Number(id)), c]] : [])
  .sort((a, b) => b[1] - a[1]).slice(0, n)

const stats = await get('/heroStats')
const heroes = {}
for (const s of stats) {
  const bench = (await get('/benchmarks?hero_id=' + s.id)).result ?? {}
  const items = await get('/heroes/' + s.id + '/itemPopularity')
  heroes[s.id] = {
    // index 0..7 = Herald..Immortal; picks/wins in the current patch window
    pick: [1, 2, 3, 4, 5, 6, 7, 8].map((b) => s[b + '_pick'] ?? 0),
    win: [1, 2, 3, 4, 5, 6, 7, 8].map((b) => s[b + '_win'] ?? 0),
    pro: [s.pro_pick ?? 0, s.pro_win ?? 0, s.pro_ban ?? 0],
    turbo: [s.turbo_picks ?? 0, s.turbo_wins ?? 0],
    bench: Object.fromEntries(Object.entries(METRICS).map(([key, short]) => [short,
      PCT.map((p) => bench[key]?.find((row) => Math.abs(row.percentile - p) < 0.001)?.value ?? null)])),
    items: { starting: top(items.start_game_items), early: top(items.early_game_items), mid: top(items.mid_game_items), late: top(items.late_game_items) },
  }
  process.stdout.write('.')
}
await mkdir('data', { recursive: true })
await writeFile('data/heroes.json', JSON.stringify({ builtAt: Date.now(), patch: constants.patch.at(-1).name, percentiles: PCT, heroes }))
console.log('\nheroes.json: ' + Object.keys(heroes).length + ' heroes')
