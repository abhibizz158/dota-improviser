import assert from 'node:assert/strict'
import test from 'node:test'
import { nums } from '../dist/main/main/guide.js'

test('nums omits an all-zero cooldown/mana list (Valve\'s honest "no cooldown", not missing data) but keeps real values', () => {
  assert.equal(nums([0, 0, 0, 0]), '')
  assert.equal(nums([0]), '')
  assert.equal(nums([24, 21, 18, 15]), '24/21/18/15')
  assert.equal(nums([0, 17]), '0/17')
  assert.equal(nums([]), '')
  assert.equal(nums(undefined), '')
})
