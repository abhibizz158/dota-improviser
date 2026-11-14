import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

// Read-only discovery of the local Steam + Dota 2 install. Nothing here touches game memory or processes.
export type LocalInfo = {
  installDir: string | null; build: number | null; versionDate: number | null; localBuilds: number
  steamAccount: string | null; gsiDir: string | null; gsiInstalled: boolean
}

// Steam is very commonly installed to a non-system drive (a dedicated games SSD), not under Program Files on
// C:, which the env-var and C:\ guesses alone never find. Probe every drive letter's conventional Steam/Steam
// library folder names too — cheap existsSync calls, no registry/native access needed.
const steamRoots = () => process.platform === 'win32'
  ? [...new Set([
      ...[process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.ProgramW6432].flatMap((root) => root ? [path.join(root, 'Steam')] : []),
      'C:/Program Files (x86)/Steam', 'C:/Program Files/Steam',
      ...Array.from({ length: 23 }, (_, i) => String.fromCharCode(68 + i)).flatMap((letter) =>
        ['Steam', 'SteamLibrary', 'Program Files (x86)/Steam', 'Program Files/Steam', 'Games/Steam'].map((suffix) => `${letter}:/${suffix}`)),
    ])]
  : [path.join(os.homedir(), 'Library/Application Support/Steam')]

export function steamLauncher() {
  const candidates = process.platform === 'darwin'
    ? ['/Applications/Steam.app', path.join(os.homedir(), 'Applications', 'Steam.app')]
    : process.platform === 'win32' ? steamRoots().map((root) => path.join(root, 'steam.exe')) : []
  return candidates.find((candidate) => existsSync(candidate))
}

const quoted = (text: string) => [...text.matchAll(/"([^"]*)"/g)].map((m) => m[1])

async function libraries(root: string) {
  const out = [root]
  try { // libraryfolders.vdf: every "path" value is a library root (external SSDs included)
    const text = await readFile(path.join(root, 'steamapps/libraryfolders.vdf'), 'utf8')
    const tokens = quoted(text)
    tokens.forEach((t, i) => { if (t === 'path' && tokens[i + 1]) out.push(tokens[i + 1].replaceAll('\\\\', '\\')) })
  } catch { /* no libraryfolders */ }
  return out
}

export function parseSteamInf(text: string) {
  const get = (key: string) => text.match(new RegExp('^' + key + '=(.*)$', 'm'))?.[1].trim()
  const build = Number(get('ClientVersion'))
  const date = Date.parse([get('VersionDate'), get('VersionTime')].join(' ') + ' UTC')
  return { build: Number.isFinite(build) ? build : null, versionDate: Number.isFinite(date) ? date : null }
}

/** MostRecent Steam login -> 32-bit account id (what OpenDota uses). Local file read only; no credentials involved. */
export function parseLoginUsers(text: string): string | null {
  const t = quoted(text)
  let best: string | null = null
  for (let i = 0; i < t.length; i++) {
    if (/^7656119\d{10}$/.test(t[i])) {
      const block = t.slice(i + 1, i + 40)
      const k = block.indexOf('MostRecent')
      if (k >= 0 && block[k + 1] === '1') best = t[i]
      else best ??= t[i]
    }
  }
  return best ? String(BigInt(best) - 76561197960265728n) : null
}

export const configName = 'gamestate_integration_dota_improviser.cfg'

export async function discover(token?: string): Promise<LocalInfo> {
  const info: LocalInfo = { installDir: null, build: null, versionDate: null, localBuilds: 0, steamAccount: null, gsiDir: null, gsiInstalled: false }
  for (const root of steamRoots()) {
    if (!existsSync(root)) continue
    // Steam briefly rewrites loginusers.vdf around sign-in/account-switch; a read that lands mid-write can fail
    // or come back truncated while Steam is still open. One short retry covers that without masking a real miss.
    for (let attempt = 0; attempt < 2 && info.steamAccount == null; attempt++) {
      try { info.steamAccount = parseLoginUsers(await readFile(path.join(root, 'config/loginusers.vdf'), 'utf8')) }
      catch { if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 150)) }
    }
    for (const lib of await libraries(root)) {
      const dir = path.join(lib, 'steamapps/common/dota 2 beta')
      if (!existsSync(path.join(dir, 'game/dota'))) continue
      info.installDir = dir
      try { Object.assign(info, parseSteamInf(await readFile(path.join(dir, 'game/dota/steam.inf'), 'utf8'))) } catch { /* ignore */ }
      try { info.localBuilds = (await readdir(path.join(dir, 'game/dota/itembuilds'))).filter((file) => /^default_.+\.txt$/.test(file)).length } catch { /* Local item builds are optional. */ }
      info.gsiDir = path.join(dir, 'game/dota/cfg/gamestate_integration')
      if (token) {
        try {
          const config = await readFile(path.join(info.gsiDir, configName), 'utf8')
          info.gsiInstalled = config.includes('"token" "' + token + '"') && config.includes('http://127.0.0.1:43182/gsi')
        } catch { /* GSI config has yet to be installed for this profile. */ }
      }
      return info
    }
  }
  return info
}

/** Valve's shipped default item builds (loose files) -> hero slug -> item keys in order. Used as a learned baseline. */
export async function defaultBuilds(installDir: string) {
  const dir = path.join(installDir, 'game/dota/itembuilds')
  const out: Record<string, Record<string, string[]>> = {}
  const stage = (header: string) => /Starting/.test(header) ? 'starting' : /Early/.test(header) ? 'early' : /Mid/.test(header) ? 'mid' : 'late'
  for (const file of await readdir(dir)) {
    const m = file.match(/^default_(.+)\.txt$/)
    if (!m) continue
    const text = await readFile(path.join(dir, file), 'utf8')
    const stages: Record<string, string[]> = {}
    for (const block of text.matchAll(/"(#DOTA_Item_Build_\w+)"\s*\{([^}]*)\}/g)) {
      const key = stage(block[1])
      const items = Array.from(block[2].matchAll(/"item"\s+"item_([a-z0-9_]+)"/g), (entry) => entry[1])
      stages[key] = [...(stages[key] ?? []), ...items]
    }
    out[m[1]] = stages
  }
  return out
}
