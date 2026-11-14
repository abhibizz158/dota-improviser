import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'
register(new URL('./ts-resolve.mjs', import.meta.url))
const { dueMapTimers } = await import('../src/shared/map-timers.ts')

const ids = (timers) => timers.map((t) => t.id)

test('bounty runes fire once at 0:00 and every 4:00 regardless of role', () => {
  assert.deepEqual(ids(dueMapTimers(-1, 0, null, 'Normal')), ['bounty-0'])
  assert.deepEqual(ids(dueMapTimers(239, 240, 'Carry', 'Ranked')), ['bounty-240'])
  assert.deepEqual(ids(dueMapTimers(0, 1, 'Carry', 'Ranked')), [])
})

test('water and power runes only fire for Mid', () => {
  assert.deepEqual(ids(dueMapTimers(119, 120, 'Mid', 'Normal')), ['water-120'])
  assert.deepEqual(ids(dueMapTimers(119, 120, 'Carry', 'Normal')), [])
  assert.deepEqual(ids(dueMapTimers(359, 360, 'Mid', 'Normal')), ['power-360'])
  assert.deepEqual(ids(dueMapTimers(359, 360, 'Offlane', 'Normal')), [])
})

test('day/night alternates every 5 minutes for every role', () => {
  const dusk = dueMapTimers(299, 300, 'Carry', 'Normal')
  assert.equal(dusk[0]?.label, 'Night falls')
  const dawn = dueMapTimers(599, 600, 'Carry', 'Normal')
  assert.equal(dawn[0]?.label, 'Daybreak')
})

test('the stacking heads-up only fires for support roles, 15s before each minute', () => {
  assert.deepEqual(ids(dueMapTimers(44, 45, 'Hard support', 'Normal')), ['stack-45'])
  assert.deepEqual(ids(dueMapTimers(44, 45, 'Soft support', 'Normal')), ['stack-45'])
  assert.deepEqual(ids(dueMapTimers(44, 45, 'Carry', 'Normal')), [])
  assert.deepEqual(ids(dueMapTimers(104, 105, 'Hard support', 'Normal')), ['stack-105'])
})

test('a big tick jump still fires the crossed event exactly once, and nothing fires in Ability Draft', () => {
  assert.deepEqual(ids(dueMapTimers(0, 245, 'Hard support', 'Normal')).filter((id) => id.startsWith('bounty')), ['bounty-240'])
  assert.deepEqual(dueMapTimers(0, 400, 'Mid', 'Ability Draft'), [])
  assert.deepEqual(dueMapTimers(-5, -1, 'Mid', 'Normal'), [])
})
