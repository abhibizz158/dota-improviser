import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { allowedGsiSections, allowedHosts, hostAllowed } from '../dist/main/shared/guard.js'
import { gsiConfig } from '../dist/main/main/gsi.js'

const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = path.join(dir, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|cts|mjs)$/.test(p) ? [p] : [] })
const files = walk('src')

test('source tree contains no memory/screen/input/packet-capture APIs', () => {
  const forbidden = /child_process|desktopCapturer|robotjs|nut-tree|uiohook|iohook|node-pcap|\bpcap\b|node:dgram|ffi-napi|koffi|ReadProcessMemory|task_for_pid|vm_read|process_vm_readv|sendInput|CGEventPost|SendKeys|screencapture/i
  for (const file of files) assert.equal(forbidden.test(readFileSync(file, 'utf8')), false, file + ' uses a forbidden API')
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
