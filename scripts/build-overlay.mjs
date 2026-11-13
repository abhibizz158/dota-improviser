import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const [platform = process.platform, arch = process.arch] = process.argv.slice(2).filter((arg) => arg !== '--optional')
const optional = process.argv.includes('--optional')
const output = new URL('../dist/main/main/overlay-window.node', import.meta.url)
const source = new URL('../native/overlay/', import.meta.url)

if (['darwin', 'win32'].includes(platform)) {
  rmSync(output, { force: true })
  const result = platform === process.platform && spawnSync(process.execPath, [
    require.resolve('node-gyp/bin/node-gyp.js'), 'rebuild', '--arch=' + arch,
    '--target=' + require('electron/package.json').version, '--dist-url=https://electronjs.org/headers',
  ], { cwd: fileURLToPath(source), stdio: 'inherit' })
  if (result && result.status === 0) {
    mkdirSync(new URL('.', output), { recursive: true })
    copyFileSync(new URL('build/Release/overlay_window.node', source), output)
  } else {
    console.error(optional ? 'Automatic Dota display detection unavailable; use the manual monitor setting.' :
      'Could not build Dota display detection. Build on the target OS with its C++ toolchain installed.')
    if (!optional) process.exitCode = 1
  }
}
