import assert from 'node:assert/strict'
import test from 'node:test'
import { pickResourceMode, trimSamples, RESOURCE_THRESHOLD_BYTES } from '../dist/main/main/resource-monitor.js'

test('resource mode flips at 16GB free, not a moment before', () => {
  assert.equal(pickResourceMode(RESOURCE_THRESHOLD_BYTES), 'full')
  assert.equal(pickResourceMode(RESOURCE_THRESHOLD_BYTES - 1), 'minimal')
  assert.equal(pickResourceMode(0), 'minimal')
  assert.equal(pickResourceMode(64 * 1024 ** 3), 'full')
})

test('the sample ring buffer drops the oldest entries once over its cap, keeps order', () => {
  const samples = Array.from({ length: 10 }, (_, i) => ({ ts: i, mode: 'full', rssMB: 0, freeMemMB: 0, totalMemMB: 0, cpuPercent: 0, overlayWindows: 0 }))
  const trimmed = trimSamples(samples, 4)
  assert.deepEqual(trimmed.map((s) => s.ts), [6, 7, 8, 9])
  assert.equal(trimSamples(samples, 100).length, 10)
})
