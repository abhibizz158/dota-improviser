// data/timings.json: OpenDota item-timing win rates per hero ([bucketSeconds, games, wins]) for the power-spike items
// the live coach tracks. Lets achievement targets come from real win rates instead of hand-set par times.
// Keep ITEMS in sync with PAR in src/shared/coach.ts.
import { readFile, writeFile } from 'node:fs/promises'
const ITEMS = ['power_treads', 'hand_of_midas', 'bfury', 'maelstrom', 'blink', 'force_staff', 'mekansm', 'glimmer_cape', 'spirit_vessel', 'pipe',
  'crimson_guard', 'black_king_bar', 'desolator', 'manta', 'radiance', 'diffusal_blade', 'yasha', 'echo_sabre', 'ultimate_scepter', 'lotus_orb']
const db = JSON.parse(await readFile('data/heroes.json', 'utf8'))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const heroes = {}
let calls = 0
for (const [id, h] of Object.entries(db.heroes)) {
  const wanted = [...new Set([...h.items.early, ...h.items.mid].map(([k]) => k))].filter((k) => ITEMS.includes(k)).slice(0, 4)
  for (const item of wanted) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`https://api.opendota.com/api/scenarios/itemTimings?hero_id=${id}&item=${item}`, { signal: AbortSignal.timeout(20000) })
      if (res.status === 429 && attempt < 6) { await wait(15000); continue }
      if (!res.ok) throw new Error(`${id}/${item}: HTTP ${res.status}`)
      const rows = (await res.json()).map((r) => [Number(r.time), Number(r.games), Number(r.wins)]).filter(([t, g]) => t > 0 && g >= 5).sort((a, b) => a[0] - b[0])
      if (rows.length >= 3) (heroes[id] ??= {})[item] = rows
      break
    }
    calls++; process.stdout.write('.'); await wait(1100)
  }
}
await writeFile('data/timings.json', JSON.stringify({ builtAt: Date.now(), heroes }))
console.log(`\ntimings.json: ${Object.keys(heroes).length} heroes, ${calls} requests`)
