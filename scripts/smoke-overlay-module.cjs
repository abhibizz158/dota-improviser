const assert = require('node:assert/strict')
const path = require('node:path')

assert.ok(process.versions.electron, 'Run this check with the packaged Electron executable')
const overlay = require(path.resolve(process.argv[2]))
assert.equal(typeof overlay.foregroundBounds, 'function')
const bounds = overlay.foregroundBounds()
if (bounds !== null) {
  assert.ok([bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite))
  assert.ok(bounds.width > 0 && bounds.height > 0)
}
console.log(`Overlay module loaded and queried in Electron on ${process.platform}/${process.arch}.`)
