import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractFile, getRawHeader, listPackage } from '@electron/asar'
import { flipFuses, FuseState, FuseVersion, FuseV1Options, getCurrentFuseWire } from '@electron/fuses'
import { packager } from '@electron/packager'

const root = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const { productName, version, author } = manifest
const [platform, arch, verifyPath] = process.argv.slice(2)
const mac = platform === 'darwin'
assert.ok(mac ? ['arm64', 'x64'].includes(arch) : platform === 'win32' && arch === 'x64', 'Unsupported package target')

const fuseSettings = {
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
}

async function verifyPackage(output) {
  const app = path.join(output, productName + (mac ? '.app' : '.exe'))
  const resources = mac ? path.join(app, 'Contents', 'Resources') : path.join(output, 'resources')
  const archive = path.join(resources, 'app.asar')
  const wire = await getCurrentFuseWire(app)
  for (const [fuse, enabled] of Object.entries(fuseSettings)) {
    assert.equal(wire[fuse], enabled ? FuseState.ENABLE : FuseState.DISABLE, FuseV1Options[fuse])
  }
  const digest = createHash('sha256').update(getRawHeader(archive).headerString).digest('hex')
  if (mac) {
    const info = path.join(app, 'Contents', 'Info.plist')
    const installedDigest = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :ElectronAsarIntegrity:Resources/app.asar:hash', info], { encoding: 'utf8' }).trim()
    assert.equal(installedDigest, digest)
    assert.equal(execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :DotaImproviserPublisher', info], { encoding: 'utf8' }).trim(), author.name)
  } else {
    const executable = await readFile(app)
    assert.ok(executable.includes(digest) || executable.includes(Buffer.from(digest, 'utf16le')), 'Missing ASAR integrity digest in Windows resources')
  }
  const attribution = JSON.parse(extractFile(archive, '.release-provenance.json'))
  assert.deepEqual(attribution, { publisher: author.name, repository: manifest.repository.url, version })
  for (const file of ['LICENSE', 'THIRD-PARTY-NOTICES.txt', 'licenses/Apache-2.0.txt']) {
    assert.ok(extractFile(archive, file).length > 0, file)
  }
  assert.ok(!listPackage(archive, {}).some((file) => /^[/\\](?:src|tests|scripts|native|data)(?:[/\\]|$)/.test(file) ||
    /^[/\\]dist[/\\].*\.map$/.test(file)), 'Unexpected source tree or source map in the archive')
  if (mac) execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' })
  console.log('Verified packaged integrity settings, license and publisher for ' + platform + '/' + arch)
}

if (verifyPath) {
  await verifyPackage(path.resolve(verifyPath))
} else {
  const frontendPackages = ['react', 'react-dom', 'scheduler', 'lucide-react', '@fontsource-variable/inter', '@fontsource/barlow-condensed']
  const notices = await Promise.all(frontendPackages.map(async (name) =>
    name + '\n\n' + await readFile(path.join(root, 'node_modules', name, 'LICENSE'), 'utf8')))
  const [output] = await packager({
    dir: root, out: path.join(root, 'release'), platform, arch, overwrite: true, asar: true,
    name: productName, appBundleId: 'com.dotaimproviser.app', appCopyright: 'Copyright © 2026 ' + author.name,
    win32metadata: { CompanyName: author.name },
    extendInfo: { DotaImproviserPublisher: author.name, DotaImproviserRepository: manifest.repository.url,
      NSScreenCaptureUsageDescription: 'Draft Vision reads the Dota 2 portrait strip during hero selection and strategy time.' },
    icon: path.join(root, 'build', mac ? 'icon.icns' : 'icon.ico'),
    ignore: [
      /^\/(?:src|native|tests|release|public|scripts|build|docs|data|\.claude|\.github|\.codex)(?:\/|$)/,
      /^\/(?:AGENTS\.md|README\.md|index\.html|vite\.config\.ts|tsconfig[^/]*\.json)$/,
      /^\/dist\/.*\.map$/,
    ],
    beforeAsar: [async ({ buildPath }) => {
      await writeFile(path.join(buildPath, '.release-provenance.json'), JSON.stringify({
        publisher: author.name, repository: manifest.repository.url, version,
      }) + '\n')
      await writeFile(path.join(buildPath, 'THIRD-PARTY-NOTICES.txt'), notices.join('\n\n') + '\n')
    }],
  })
  const app = path.join(output, productName + (mac ? '.app' : '.exe'))
  await flipFuses(app, { version: FuseVersion.V1, ...fuseSettings })
  if (mac) execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
  await verifyPackage(output)
}
