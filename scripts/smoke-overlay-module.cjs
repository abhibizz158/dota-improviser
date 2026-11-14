const assert = require('node:assert/strict')
const path = require('node:path')

assert.ok(process.versions.electron, 'Run this check with Electron')
const overlay = require(path.resolve(process.argv[2]))
assert.equal(typeof overlay.foregroundBounds, 'function')
if (process.platform === 'darwin') {
  for (const method of ['dotaWindowID', 'requestScreenRecording', 'startDraftWindowPicker', 'draftWindowShareState', 'readSharedDraftBar', 'stopDraftWindowShare']) {
    assert.equal(typeof overlay[method], 'function', method)
  }
  assert.ok(['idle', 'unsupported'].includes(overlay.draftWindowShareState()))
  assert.equal(overlay.startDraftWindowPicker(0, 0.075), null)
  assert.equal(overlay.readSharedDraftBar(), null)
}
const bounds = overlay.foregroundBounds()
if (bounds !== null) {
  assert.ok([bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite))
  assert.ok(bounds.width > 0 && bounds.height > 0)
}
console.log(`Overlay module loaded and queried in Electron on ${process.platform}/${process.arch}.`)
