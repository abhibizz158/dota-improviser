import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'
register(new URL('./ts-resolve.mjs', import.meta.url))
const { suggest, avoid, positionFit, compositionPoints, teamWinProb, seedIndex } = await import('../src/shared/brain.ts')

const hero = (id, roles = ['Carry']) => ({ id, slug: 'h' + id, name: 'H' + id, roles })
const heroes = [1, 2, 3, 4, 5, 6].map((i) => hero(i))
// pair rows are [enemy, games, wins by the row's hero]
const seed = { patch: '7', builtAt: 1, matchups: {
  1: [[9, 800, 440]], // strong hero (base .56) beating weak enemy exactly as expected: NOT a counter
  2: [[9, 800, 520]], // average hero (base .50) crushing the enemy: a real counter
  3: [[9, 800, 300]], // loses badly
  4: [], 5: [[9, 800, 400]], 6: [[9, 800, 400]],
} }
const base = { 1: 0.56, 2: 0.5, 3: 0.5, 4: 0.5, 5: 0.5, 6: 0.5, 9: 0.5 }
const input = { heroes, role: 'Carry', enemy: [9], allied: [], pool: [], seed, live: {}, profile: { heroes: {}, pairs: {} }, overrides: {}, stale: false, base }

test('a hero that is merely strong is not mistaken for a counter; real matchup edge outranks raw strength', () => {
  const out = suggest(input, 6)
  const by = Object.fromEntries(out.map((s) => [s.heroId, s]))
  assert.ok(Math.abs(by[1].edge) < 2.5, 'strong hero edge ' + by[1].edge) // .55 observed vs .56 expected
  assert.ok(by[2].edge > 8, 'real counter edge ' + by[2].edge)
  assert.equal(out[0].heroId, 2) // counter beats the merely strong hero
  assert.ok(by[3].winRate < 50)
})

test('predicted win rates spread around 50 instead of all sitting above it', () => {
  const rates = suggest(input, 6).map((s) => s.winRate)
  assert.ok(Math.min(...rates) < 45 && Math.max(...rates) > 55, rates.join())
  assert.deepEqual(avoid(input, 3).map((s) => s.heroId), [3]) // only the hero that truly loses the matchup
})

test('pairs with no data fall back to the mechanics prior, and real data overrides it', () => {
  const mech = { k: 100, predict: (c) => ({ edge: c === 4 ? 4 : 0, parts: c === 4 ? [{ label: 'duel', points: 4 }] : [] }) }
  const withMech = suggest({ ...input, mech }, 6).find((s) => s.heroId === 4)
  assert.equal(withMech.why[0].source, 'mechanics')
  assert.ok(withMech.winRate > 53 && withMech.mech.parts[0].label === 'duel')
  const noData = suggest(input, 6).find((s) => s.heroId === 4)
  assert.ok(Math.abs(noData.winRate - 50) < 0.5) // no data, no mechanics: stays at expectation
  const big = { ...seed, matchups: { ...seed.matchups, 5: [[9, 20000, 8000]] } } // 40% over a huge sample
  const strong = suggest({ ...input, seed: big, mech: { ...mech, predict: () => ({ edge: 6, parts: [] }) } }, 6).find((s) => s.heroId === 5)
  assert.ok(strong.winRate < 43, 'data beats the prior: ' + strong.winRate)
})

test('position fit uses Valve role levels; supports do not fill the carry slot', () => {
  const carry = [3, 0, 0, 0, 0, 0, 1, 0, 0], support = [0, 3, 1, 2, 0, 0, 0, 0, 1]
  assert.ok(positionFit(hero(1), 'Carry', carry) > 0.6)
  assert.ok(positionFit(hero(2), 'Carry', support) < 0.15)
  assert.ok(positionFit(hero(2), 'Hard support', support) > 0.6)
  const levels = { 1: carry, 2: support, 3: carry, 4: carry, 5: carry, 6: carry }
  const ids = suggest({ ...input, levels }, 6).map((s) => s.heroId)
  assert.ok(!ids.includes(2)) // support hero excluded from the carry list
})

test('team composition rewards the missing role once two allies are known', () => {
  const allCarries = [[3, 0, 0, 0, 0, 0, 0, 0, 0], [3, 0, 0, 0, 0, 0, 0, 0, 0], [3, 0, 0, 0, 0, 0, 0, 0, 0]]
  const support = [0, 3, 0, 3, 0, 0, 0, 0, 1], carry = [3, 0, 0, 0, 0, 0, 0, 0, 0]
  assert.equal(compositionPoints(support, allCarries.slice(0, 1)), 0) // too few allies to judge
  assert.ok(compositionPoints(support, allCarries) > compositionPoints(carry, allCarries) + 2)
})

test('team win estimate moves with the lineups and respects hero strength', () => {
  const idx = seedIndex(seed)
  const good = teamWinProb([2], [9], idx, base), bad = teamWinProb([3], [9], idx, base)
  assert.ok(good > 55 && bad < 45)
  assert.equal(teamWinProb([2], [77], idx, base), null)
})

test('Medusa triggers a role-appropriate mana counter even before public data loads', () => {
  const antiMage = { ...hero(1), slug: 'antimage', name: 'Anti-Mage' }
  const medusa = { ...hero(94), slug: 'medusa', name: 'Medusa' }
  const roster = [hero(2), hero(3), antiMage, medusa]
  const draft = { ...input, heroes: roster, seed: null, base: {}, enemy: [94] }
  const out = suggest(draft)
  assert.equal(out[0].heroId, 1)
  assert.match(out[0].why[0].reason, /Mana Break.*Medusa/)
  assert.equal(out[0].games, 0)
  assert.ok(!suggest({ ...draft, banned: [1] }).some((item) => item.heroId === 1))
  assert.ok(!suggest({ ...draft, allied: [1] }).some((item) => item.heroId === 1))
  assert.equal(suggest({ ...draft, enemy: [3] })[0].why[0].reason, undefined)
})

test('ally-only draft gives a real combination before enemies are revealed', () => {
  const lineup = { ...input, heroes: [hero(1), hero(7, ['Disabler']), hero(2, ['Durable'])], seed: null, base: {}, enemy: [], allied: [7] }
  const [candidate] = suggest(lineup)
  assert.equal(candidate.heroId, 1)
  assert.match(candidate.synergy, /H7 can lock targets down/)
  assert.equal(candidate.winRate, null)
})
