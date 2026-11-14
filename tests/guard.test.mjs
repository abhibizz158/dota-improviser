import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { allowedGsiSections, allowedHosts, hostAllowed } from '../dist/main/shared/guard.js'
import { gsiConfig } from '../dist/main/main/gsi.js'

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const p = path.join(dir, entry.name)
  return entry.isDirectory() && entry.name !== 'build' ? walk(p) : /\.(ts|tsx|cts|mjs|cc|mm|h)$/.test(p) ? [p] : []
})
const files = [...walk('src'), ...walk('native')]

// One deliberate, narrow exception: src/main/draft-vision.ts may use desktopCapturer, and only that API, only
// there, and only strictly gated to Dota's own pick/strategy-time game_state (see AGENTS.md "Draft vision" and
// the file's own doc comment for the full scope). Every other forbidden API, and desktopCapturer everywhere
// else in the tree, stays an absolute ban — this does not open the door to screen/memory/input/packet capture
// in general, just this one calibrated, phase-gated, portrait-matching feature.
const visionFile = 'src/main/draft-vision.ts'
test('source tree contains no memory/screen/input/packet-capture APIs outside the gated draft-vision module', () => {
  const forbidden = /child_process|desktopCapturer|robotjs|nut-tree|uiohook|iohook|node-pcap|\bpcap\b|node:dgram|ffi-napi|koffi|ReadProcessMemory|PROCESS_VM_READ|task_for_pid|vm_read|process_vm_readv|sendInput|CGEventPost|SendKeys|screencapture|CGWindowListCreateImage|\bBitBlt\b|\bPrintWindow\b|SetWindowsHookEx|CGEventTapCreate/i
  for (const file of files.filter((f) => f !== visionFile)) assert.equal(forbidden.test(readFileSync(file, 'utf8')), false, file + ' uses a forbidden API')
})

test('draft-vision module uses only desktopCapturer (no other forbidden API) and gates every entry point on inPickPhase', () => {
  const source = readFileSync(visionFile, 'utf8')
  const otherForbidden = /child_process|robotjs|nut-tree|uiohook|iohook|node-pcap|\bpcap\b|node:dgram|ffi-napi|koffi|ReadProcessMemory|PROCESS_VM_READ|task_for_pid|vm_read|process_vm_readv|sendInput|CGEventPost|SendKeys|screencapture|CGWindowListCreateImage|\bBitBlt\b|\bPrintWindow\b|SetWindowsHookEx|CGEventTapCreate/i
  assert.equal(otherForbidden.test(source), false, visionFile + ' uses a forbidden API beyond its one allowed exception')
  assert.match(source, /desktopCapturer/, visionFile + ' should use desktopCapturer; if it no longer does, drop this exception entirely')
  // Both capture entry points take inPickPhase as their first parameter and bail out immediately when it's false.
  for (const fn of ['captureDraftPicks', 'debugCaptureDraftPicks']) {
    const body = source.slice(source.indexOf('export async function ' + fn))
    assert.match(body, /\(inPickPhase: boolean,/, fn + ' must take inPickPhase as its first parameter')
    assert.match(body.slice(0, 200), /if \(!inPickPhase\) return null/, fn + ' must bail out immediately when inPickPhase is false')
  }
})

test('package.json carries no capture/injection dependencies', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).join(' ')
  assert.equal(/robotjs|nut-tree|uiohook|pcap|ffi-napi|koffi|screenshot|frida/i.test(deps), false)
})

test('every hard-coded https URL targets an allowlisted host', () => {
  for (const file of files.filter((f) => !f.includes('guard.ts'))) {
    for (const [url] of readFileSync(file, 'utf8').matchAll(/https?:\/\/[a-z0-9.-]+/gi)) {
      const host = url.replace(/^https?:\/\//, '')
      assert.ok(allowedHosts.includes(host) || host === '127.0.0.1' || host === 'localhost', file + ' references ' + host)
    }
  }
})

test('GSI config requests only player-visible sections', () => {
  const cfg = gsiConfig(1, 't')
  const requested = [...cfg.matchAll(/^\s{4}"(\w+)" "1"$/gm)].map((m) => m[1])
  assert.deepEqual(requested, [...allowedGsiSections])
  for (const hidden of ['allplayers', 'buildings', 'wearables', 'minimap', 'events', 'roshan', 'couriers']) assert.equal(requested.includes(hidden), false)
})

test('network allowlist blocks unknown hosts and non-https remotes', () => {
  assert.equal(hostAllowed('https://api.opendota.com/api/heroStats'), true)
  assert.equal(hostAllowed('http://127.0.0.1:43182/gsi'), true)
  assert.equal(hostAllowed('https://evil.example/x'), false)
  assert.equal(hostAllowed('http://api.opendota.com/x'), false)
})
