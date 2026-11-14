import assert from 'node:assert/strict'
import test from 'node:test'
import { gameDisplay, overlayBounds } from '../dist/main/main/overlay-layout.js'

const primary = { id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: { x: 0, y: 38, width: 1440, height: 822 } }
const secondary = { id: 2, bounds: { x: -1280, y: -200, width: 1280, height: 1024 }, workArea: { x: -1280, y: -176, width: 1280, height: 1000 } }
const compact = { size: 'Compact', placement: 'Auto' }

test('a window spanning displays follows the larger overlap, including monitors above and left', () => {
  const displays = [primary, secondary]
  assert.equal(gameDisplay(displays, { x: -640, y: -140, width: 900, height: 600 }), secondary)
  assert.equal(gameDisplay(displays, { x: -100, y: 0, width: 900, height: 600 }), primary)
  assert.equal(gameDisplay([primary], { x: -950, y: 0, width: 700, height: 500 }), undefined)
})

test('auto corners respect both the work area and a smaller windowed game', () => {
  const game = { x: -980, y: -190, width: 800, height: 640 }
  const draft = overlayBounds(secondary.workArea, game, compact, 'draft', 220, false)
  const lane = overlayBounds(secondary.workArea, game, compact, 'lane', 220, false)
  assert.ok(draft.x > game.x && draft.x < lane.x)
  assert.equal(draft.y, lane.y)
  assert.ok(lane.y > secondary.workArea.y)
  assert.ok(lane.x + lane.width < game.x + game.width)
})

test('passive card is capped and a larger editor remains within a small screen', () => {
  const work = { x: 1440, y: 50, width: 660, height: 420 }
  const settings = { size: 'Compact', placement: 'Bottom right' }
  const passive = overlayBounds(work, null, settings, 'draft', 2000, false)
  const editor = overlayBounds(work, null, settings, 'draft', 2000, true)
  assert.ok(passive.height < editor.height && passive.width < editor.width)
  assert.ok(editor.x >= work.x && editor.y >= work.y)
  assert.equal(editor.x + editor.width, passive.x + passive.width)
  assert.equal(editor.y + editor.height, passive.y + passive.height)
  assert.ok(editor.x + editor.width < work.x + work.width && editor.y + editor.height < work.y + work.height)
})

test('the clickable match setup opens at form size and the coach returns to compact size', () => {
  const setup = overlayBounds(primary.workArea, null, compact, 'setup', null, false)
  const coach = overlayBounds(primary.workArea, null, compact, 'lane', null, false)
  assert.ok(setup.width > coach.width)
  assert.ok(setup.height > coach.height)
  assert.equal(setup.x + setup.width, coach.x + coach.width)
})
