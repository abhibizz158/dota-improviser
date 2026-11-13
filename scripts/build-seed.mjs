// Builds data/seed.json: pre-learned hero-vs-hero counters from OpenDota public aggregates.
// Run: npm run seed   (≈3 min; OpenDota free tier allows 60 req/min). Re-run after each Dota patch.
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

const constants = createRequire(import.meta.url)('dotaconstants')
const heroes = Object.values(constants.heroes).map((h) => h.id)
const matchups = {}
for (const id of heroes) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.opendota.com/api/heroes/${id}/matchups`, { signal: AbortSignal.timeout(15000) })
    if (res.status === 429 && attempt < 5) { await new Promise((r) => setTimeout(r, 15000)); continue }
    if (!res.ok) throw new Error(`hero ${id}: HTTP ${res.status}`)
    // wins = games the hero `id` won against enemy hero_id
    matchups[id] = (await res.json()).filter((r) => r.games_played >= 20).map((r) => [r.hero_id, r.games_played, r.wins])
    break
  }
  process.stdout.write('.')
  await new Promise((r) => setTimeout(r, 1100))
}
await mkdir('data', { recursive: true })
await writeFile('data/seed.json', JSON.stringify({ patch: constants.patch.at(-1).name, builtAt: Date.now(), source: 'opendota', matchups }))
console.log(`\nseed.json: ${heroes.length} heroes, patch ${constants.patch.at(-1).name}`)
