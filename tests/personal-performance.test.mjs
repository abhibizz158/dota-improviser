import assert from 'node:assert/strict'
import test from 'node:test'
import { checkpointAt, comparePerformance } from '../dist/main/shared/personal-performance.js'
import { combinePerformance, reviewedPerformance } from '../dist/main/main/performance-history.js'

const sample = (at, values) => ({ at, values })
const match = (id, values, options = {}) => ({
  id, heroId: 22, role: 'Carry', mode: 'Ranked', samples: [sample(300, values)], ...options,
})

test('a checkpoint requires a continuous, unpaused crossing near the five-minute mark', () => {
  assert.equal(checkpointAt(298, 302, false), 300)
  assert.equal(checkpointAt(599, 600, false), 600)
  assert.equal(checkpointAt(298, 300, true), null)
  assert.equal(checkpointAt(278, 301, false), null)
  assert.equal(checkpointAt(null, 600, false), null)
  assert.equal(checkpointAt(601, 603, false), null)
})

test('score compares the same minute in the matching mode and excludes the current match', () => {
  const values = { gpm: 310, xpm: 350, deaths: 0, items: 1 }
  const current = { id: 'current', heroId: 22, mode: 'Ranked', role: 'Carry' }
  const history = [
    match('a', { gpm: 300, xpm: 340, deaths: 2, items: 0 }),
    match('b', { gpm: 300, xpm: 340, deaths: 2, items: 0 }),
    match('c', { gpm: 300, xpm: 340, deaths: 2, items: 0 }),
    match('current', { gpm: 999, xpm: 999 }),
    match('turbo', { gpm: 999, xpm: 999 }, { mode: 'Turbo' }),
  ]
  const { points } = comparePerformance([sample(300, values), sample(600, values)], history, current)
  assert.equal(points[0].score, 100)
  assert.equal(points[0].matches, 3)
  assert.equal(points[0].metrics.find((metric) => metric.key === 'deaths').score, 100)
  assert.equal(points[1].score, null)
  assert.equal(comparePerformance([sample(300, values)], history.slice(0, 2), current).points[0].score, null)
})

test('support emphasizes fights over last hits and hero-specific metrics require a matching hero', () => {
  const values = { lastHits: 0, participation: 5, items: 4, level: 9 }
  const history = ['a', 'b', 'c'].map((id) => match(id, { lastHits: 1, participation: 1, items: 0, level: 1 }, { heroId: 5 }))
  const current = { id: null, heroId: 22, mode: 'Ranked' }
  const carry = comparePerformance([sample(300, values)], history, { ...current, role: 'Carry' }).points[0]
  const support = comparePerformance([sample(300, values)], history.map((row) => ({ ...row, role: 'Hard support' })), { ...current, role: 'Hard support' }).points[0]
  assert.deepEqual(carry.metrics.map((metric) => metric.key), ['lastHits', 'participation'])
  assert.ok(support.score > carry.score)
})

test('replay and live samples for one match merge without double-counting', () => {
  const replay = reviewedPerformance({ id: 'a', heroId: 22, role: 'Mid', mode: 'Ranked All Pick', minutes: [
    { time: 300, gold: 1500, xp: 2000, lastHits: 25, deaths: 0 },
  ], events: [], purchasesAvailable: true })
  const [merged] = combinePerformance([match('a', { gpm: 325, level: 7 })], [replay])
  assert.deepEqual(merged.samples[0].values, { gpm: 325, xpm: 400, lastHits: 25, deaths: 0, items: 0, level: 7 })
  assert.equal(combinePerformance([match('a', {})], [replay]).length, 1)
})
