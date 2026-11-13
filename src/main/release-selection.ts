export type Asset = { id: number; name: string; digest: string; size: number }
const version = (tag: unknown) => typeof tag === 'string' && /^v?\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(tag) ? tag.replace(/^v/, '') : null

export function compareVersions(a: string, b: string) {
  const aa = a.split('.').map(Number), bb = b.split('.').map(Number)
  return aa[0] - bb[0] || aa[1] - bb[1] || aa[2] - bb[2]
}

export function installerName(v: string, platform: NodeJS.Platform, arch: string) {
  if (!version(v)) return null
  if (platform === 'darwin' && ['arm64', 'x64'].includes(arch)) return `Dota-Improviser-${v}-macos-${arch}.pkg`
  if (platform === 'win32' && arch === 'x64') return `Dota-Improviser-${v}-windows-x64-setup.exe`
  return null
}

export function selectRelease(value: unknown, current: string, platform: NodeJS.Platform, arch: string) {
  if (!Array.isArray(value) || !version(current)) return null
  return value.flatMap((release) => {
    const next = version(release?.tag_name)
    if (!next || release.draft !== false || compareVersions(next, current) <= 0) return []
    const name = installerName(next, platform, arch)
    const asset = (Array.isArray(release.assets) ? release.assets : []).find((item: Asset & { state?: string }) => item?.name === name && item.state === 'uploaded' &&
      Number.isSafeInteger(item.id) && item.id > 0 && Number.isSafeInteger(item.size) && item.size > 0 && item.size <= 512 * 1024 * 1024 &&
      typeof item.digest === 'string' && /^sha256:[a-f0-9]{64}$/.test(item.digest))
    return asset ? [{ next, asset: asset as Asset }] : []
  }).sort((a, b) => compareVersions(b.next, a.next))[0] ?? null
}
