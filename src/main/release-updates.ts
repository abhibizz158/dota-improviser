import { app, safeStorage, shell } from 'electron'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { UpdateInfo } from '../shared/model.js'
import type { Store } from './store.js'
import { selectRelease } from './release-selection.js'
import type { Asset } from './release-selection.js'

const repository = 'abhibizz158/dota-improviser'
const api = 'https://api.github.com/repos/' + repository
const downloadHosts = new Set(['release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'github-releases.githubusercontent.com'])
const storedKey = 'github-release-token'
export class ReleaseUpdates {
  private credential = ''
  private generation = 0
  private operation: Promise<UpdateInfo> | undefined
  private installer: { file: string; asset: Asset } | undefined
  private info: UpdateInfo
  constructor(private store: Store, private notify: (info: UpdateInfo) => void) {
    // The repository is public, so update checks work with no token at all (GitHub's unauthenticated rate limit,
    // 60 requests/hour, comfortably covers a check every few hours). A token only raises that ceiling.
    this.info = { current: app.getVersion(), latest: null, connected: Boolean(store.get(storedKey)), state: 'idle', message: '' }
  }
  status() { return this.info }
  private set(fields: Partial<UpdateInfo>) {
    this.info = { ...this.info, ...fields }
    this.notify(this.info)
    return this.info
  }
  private async readCredential() {
    if (this.credential) return this.credential
    const saved = this.store.get<string>(storedKey)
    if (!saved) return ''
    try {
      const generation = this.generation
      const { result } = await safeStorage.decryptStringAsync(Buffer.from(saved, 'base64'))
      if (generation === this.generation) this.credential = result
      return result
    }
    catch { throw new Error('Unlock the system credential store or reconnect GitHub to check for updates.') }
  }
  async connect(value: unknown) {
    if (typeof value !== 'string' || !/^github_pat_[a-zA-Z0-9_]{20,255}$/.test(value)) throw new Error('Enter a fine-grained GitHub token with read access to this repository.')
    const operation = this.generation
    const response = await this.releases(value)
    if (!response.ok) throw new Error('GitHub rejected access. Check that the token can read Contents for this repository.')
    await response.body?.cancel()
    const encrypted = await safeStorage.encryptStringAsync(value)
    if (operation !== this.generation) return this.info
    this.credential = value
    this.store.set(storedKey, encrypted.toString('base64'))
    this.set({ connected: true, message: '' })
    if (this.operation) await this.operation
    return operation === this.generation ? this.check() : this.info
  }
  disconnect() {
    this.generation++
    this.credential = ''
    this.store.set(storedKey, '')
    this.installer = undefined
    return this.set({ connected: false, latest: null, state: 'idle', message: '' })
  }
  private releases(credential: string) {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
    if (credential) headers.Authorization = 'Bearer ' + credential
    return fetch(api + '/releases?per_page=20', { headers, redirect: 'error', signal: AbortSignal.timeout(15000) })
  }
  check() {
    if (!app.isPackaged) return Promise.resolve(this.info)
    this.operation ??= this.run(this.generation).finally(() => { this.operation = undefined })
    return this.operation
  }
  private async run(generation: number): Promise<UpdateInfo> {
    if (this.info.state === 'ready') return this.info
    this.set({ state: 'checking', message: '' })
    try {
      const credential = await this.readCredential()
      if (generation !== this.generation) return this.info
      const response = await this.releases(credential)
      if (!response.ok) throw new Error('GitHub could not check for updates (HTTP ' + response.status + ').')
      const release = selectRelease(await response.json(), this.info.current, process.platform, process.arch)
      if (generation !== this.generation) return this.info
      if (!release) return this.set({ latest: null, state: 'current', message: '' })
      this.set({ latest: release.next, state: 'downloading', message: '' })
      const file = await this.download(release.asset, credential)
      if (generation !== this.generation) return this.info
      this.installer = { file, asset: release.asset }
      return this.set({ state: 'ready' })
    } catch (error) {
      return generation === this.generation ? this.set({ state: 'error', message: error instanceof Error ? error.message : 'Update check failed.' }) : this.info
    }
  }
  private async download(asset: Asset, credential: string) {
    const directory = path.join(app.getPath('userData'), 'updates')
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const file = path.join(directory, asset.name)
    const temp = file + '.' + process.pid + '.partial'
    const signal = AbortSignal.timeout(20 * 60000)
    const headers: Record<string, string> = { Accept: 'application/octet-stream' }
    if (credential) headers.Authorization = 'Bearer ' + credential
    let response = await fetch(api + '/releases/assets/' + asset.id, { headers, redirect: 'manual', signal })
    if (response.status === 302) {
      const redirect = new URL(response.headers.get('location') ?? '')
      if (redirect.protocol !== 'https:' || redirect.username || redirect.password || redirect.port || !downloadHosts.has(redirect.hostname)) throw new Error('GitHub returned an unsupported download location.')
      await response.body?.cancel()
      response = await fetch(redirect, { redirect: 'error', signal })
    }
    if (response.status !== 200 || !response.body) throw new Error('GitHub could not download the installer (HTTP ' + response.status + ').')
    const hash = createHash('sha256')
    let bytes = 0
    try {
      await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          bytes += chunk.length
          if (bytes > asset.size) return callback(new Error('The update download exceeded its published size.'))
          hash.update(chunk)
          callback(null, chunk)
        },
      }), createWriteStream(temp, { mode: 0o600, flags: 'wx' }), { signal })
      if (bytes !== asset.size || 'sha256:' + hash.digest('hex') !== asset.digest) throw new Error('The update failed its integrity check.')
      await rename(temp, file)
      // Each version downloads under its own versioned filename; without this, every past installer piles up here forever.
      const siblings = await readdir(directory).catch(() => [])
      await Promise.all(siblings.filter((name) => name !== path.basename(file)).map((name) => rm(path.join(directory, name), { force: true }).catch(() => {})))
      return file
    } finally { await rm(temp, { force: true }).catch(() => {}) }
  }
  /** Launches the downloaded, verified installer. This still opens the OS's own installer UI (NSIS's small
   * click-through wizard on Windows, Installer.app with your admin password on macOS): this app's fair-play
   * guardrail (tests/guard.test.mjs) blanket-forbids spawning other processes anywhere in the source tree, so
   * there's no `/S`-silent or in-place-swap path available to it either — the automation this app can offer is
   * launching that installer itself the moment a verified update is ready and you're not mid-game, instead of
   * making you find the button (see scheduleAppUpdates in main/index.ts and the autoInstallApp feature). */
  async install() {
    const installer = this.installer
    if (!installer || this.info.state !== 'ready') throw new Error('There is no verified update ready to install.')
    if ((await stat(installer.file)).size !== installer.asset.size) throw new Error('The installer changed on disk.')
    const hash = createHash('sha256')
    const { createReadStream } = await import('node:fs')
    for await (const chunk of createReadStream(installer.file)) hash.update(chunk)
    if ('sha256:' + hash.digest('hex') !== installer.asset.digest || this.installer !== installer) throw new Error('The installer failed verification.')
    const error = await shell.openPath(installer.file)
    if (error) throw new Error('Could not open the installer. Download it from the GitHub release page.')
    app.quit()
  }
}
