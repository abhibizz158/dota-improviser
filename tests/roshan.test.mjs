import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'
register(new URL('./ts-resolve.mjs', import.meta.url))
const { roshanView, aegisView, clockText, ROSHAN_MIN_MS, ROSHAN_MAX_MS, AEGIS_MS, emptyRoshan } = await import('../src/shared/roshan.ts')

test('with no timer started, both views report unknown/null', () => {
  assert.deepEqual(roshanView(null, Date.now()), { state: 'unknown', minLeft: null, maxLeft: null })
  assert.deepEqual(aegisView(null, Date.now()), { left: null, expired: false })
  assert.deepEqual(emptyRoshan, { roshanAt: null, aegisAt: null })
})

test('roshan window: waiting until 8:00, open from 8:00 to 11:00, unknown after 11:00', () => {
  const start = 1_000_000
  assert.equal(roshanView(start, start).state, 'waiting')
  assert.equal(roshanView(start, start + ROSHAN_MIN_MS - 1000).state, 'waiting')
  assert.equal(roshanView(start, start + ROSHAN_MIN_MS).state, 'open')
  assert.equal(roshanView(start, start + ROSHAN_MAX_MS - 1000).state, 'open')
  assert.equal(roshanView(start, start + ROSHAN_MAX_MS + 1).state, 'unknown')
  const v = roshanView(start, start + 60_000)
  assert.equal(v.minLeft, ROSHAN_MIN_MS - 60_000)
  assert.equal(v.maxLeft, ROSHAN_MAX_MS - 60_000)
})

test('aegis expires exactly 5:00 after it starts and never goes negative', () => {
  const start = 2_000_000
  assert.equal(aegisView(start, start).expired, false)
  assert.equal(aegisView(start, start + AEGIS_MS - 1).expired, false)
  assert.equal(aegisView(start, start + AEGIS_MS).expired, true)
  assert.equal(aegisView(start, start + AEGIS_MS).left, 0)
  assert.equal(aegisView(start, start + AEGIS_MS + 50_000).left, 0)
})

test('clockText formats minutes:seconds with zero padding', () => {
  assert.equal(clockText(0), '0:00')
  assert.equal(clockText(5_000), '0:05')
  assert.equal(clockText(65_000), '1:05')
  assert.equal(clockText(-500), '0:00') // never shows a negative countdown
})
