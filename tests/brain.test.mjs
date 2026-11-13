import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultWeights, fitWeights, learnProfile, pairKey, seedStale, suggest } from '../dist/main/shared/brain.js'
import { parseLoginUsers, parseSteamInf } from '../dist/main/main/local.js'

const heroes = [1, 2, 3].map((id) => ({ id, slug: 'h' + id, name: 'H' + id, roles: ['Carry'] }))
const seed = { patch: '7.41', builtAt: 1, matchups: { 1: [[9, 1000, 600]], 2: [[9, 1000, 400]], 3: [[9, 10, 10]] } }
const base = { heroes, role: 'Carry', enemy: [9], allied: [], pool: [], seed, live: {}, profile: { heroes: {}, pairs: {} }, overrides: {}, stale: false }

test('seed ranks counters; tiny samples shrink toward 50%', () => {
  const out = suggest(base)
  assert.deepEqual(out.map((s) => s.heroId), [1, 3, 2])
  assert.ok(out.find((s) => s.heroId === 3).winRate < 60) // 10/10 wins must not look like 100%
})

test('live data replaces seed; personal pairs and manual nudges move the score; stale seed weakens', () => {
  const live = { 9: [{ heroId: 2, games: 5000, wins: 1500 }] } // enemy 9 beat hero 2 only 30% -> hero 2 wins 70%
  assert.equal(suggest({ ...base, live })[0].heroId, 2)
  assert.equal(suggest({ ...base, live })[0].why[0].source, 'live')
  const mine = { heroes: {}, pairs: { [pairKey(2, 9)]: { g: 200, w: 200 } } }
  assert.equal(suggest({ ...base, profile: mine })[0].heroId, 2)
  assert.equal(suggest({ ...base, overrides: { [pairKey(3, 9)]: 15 } })[0].heroId, 3)
  const top = (stale) => suggest({ ...base, stale })[0].winRate
  assert.ok(top(true) < top(false)) // stale seed pulls toward 50%
})

test('profile learns from own matches only, with recency decay', () => {
  const now = Date.UTC(2026, 10, 13)
  const me = { accountId: '5', heroId: 1, side: 'Radiant', won: true }
  const review = (start) => ({ start: start / 1000, players: [me, { accountId: null, heroId: 9, side: 'Dire', won: false }] })
  const fresh = learnProfile([], [review(now)], '5', now).pairs[pairKey(1, 9)]
  const old = learnProfile([], [review(now - 240 * 86400000)], '5', now).pairs[pairKey(1, 9)]
  assert.equal(fresh.g, 1)
  assert.ok(Math.abs(old.g - 0.25) < 1e-6)
  assert.deepEqual(learnProfile([], [review(now)], '6', now).pairs, {})
})

test('seed staleness follows game build date and patch', () => {
  assert.equal(seedStale(null, null, '7.41'), true)
  assert.equal(seedStale({ ...seed, builtAt: 100 }, 200, '7.41'), true)
  assert.equal(seedStale({ ...seed, builtAt: 300 }, 200, '7.41'), false)
  assert.equal(seedStale({ ...seed, builtAt: 300 }, 200, '7.42'), true)
})

test('steam.inf and loginusers parsing', () => {
  const inf = parseSteamInf('ClientVersion=6975\nVersionDate=Nov 12 2026\nVersionTime=17:19:35\n')
  assert.equal(inf.build, 6975)
  assert.equal(new Date(inf.versionDate).toISOString(), '2026-11-12T17:19:35.000Z')
  const vdf = '"users"{"76561197960265729"{"AccountName" "a" "MostRecent" "0"}"76561197960265800"{"AccountName" "b" "MostRecent" "1"}}'
  assert.equal(parseLoginUsers(vdf), '72')
})

test('older patches count less in the learned profile', () => {
  const now = Date.UTC(2026, 10, 13)
  const row = (patch) => ({ heroId: 1, start: now / 1000, won: true, patch, gpm: 500, xpm: 600, lastHits: 200, duration: 1800 })
  const patches = ['7.39', '7.40', '7.41']
  const cur = learnProfile([row('7.41')], [], '5', now, patches).heroes[1].g
  const old = learnProfile([row('7.39')], [], '5', now, patches).heroes[1].g
  assert.ok(Math.abs(cur - 1) < 1e-6)
  assert.ok(Math.abs(old - 0.65 ** 2) < 1e-6)
  const st = learnProfile([row('7.41')], [], '5', now, patches).stats[1]
  assert.equal(Math.round(st.lhpm), 7) // 200 LH over 30 min
})

test('fitWeights keeps defaults on little data and learns which signal predicts your wins', () => {
  let seedN = 7
  const rnd = () => (seedN = (seedN * 1664525 + 1013904223) % 4294967296) / 4294967296
  const gen = (fn) => Array.from({ length: 300 }, () => { const counter = (rnd() - 0.5) * 10, comfort = (rnd() - 0.5) * 30; return { counter, comfort, won: fn(counter, comfort) + (rnd() - 0.5) * 0.4 > 0 } })
  assert.deepEqual(fitWeights(gen(() => 1).slice(0, 10)), { ...defaultWeights, samples: 10 })
  const comfortDriven = fitWeights(gen((c, m) => m / 15))
  const counterDriven = fitWeights(gen((c) => c / 5))
  assert.ok(comfortDriven.comfort > counterDriven.comfort)
  assert.ok(counterDriven.comfort < defaultWeights.comfort)
  assert.ok(comfortDriven.comfort <= 1.5 && counterDriven.comfort >= 0.1)
})

test('recently patched heroes have their old seed pair data trusted less', () => {
  const normal = suggest({ ...base })[0]
  const patched = suggest({ ...base, changed: [1] }).find((x) => x.heroId === 1)
  assert.ok(patched.winRate < normal.winRate) // hero 1 (60% seed) pulled toward 50%
})
