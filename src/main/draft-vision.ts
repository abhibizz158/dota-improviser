import { desktopCapturer, nativeImage } from 'electron'
import type { NativeImage } from 'electron'
import type { Hero } from '../shared/model.js'

/** Draft Vision compares only the pick-bar strip from the player's Dota window. Both capture entry points
 * require a verified Hero Selection or Strategy Time packet and discard frames when the phase changes. */
type Slots = (number | null)[]
export type VisionReveal = { radiant: Slots; dire: Slots }
export type VisionTarget = {
  windowID?: number | null; requireWindowID?: boolean; width: number; height: number; ownHero?: number | null; ownTeam?: 'Radiant' | 'Dire';
  active: () => boolean; readSharedBar?: () => Buffer | null; learned?: PortraitMemory[]
  /** The display Dota's window sits on. Windows can't produce a DWM thumbnail for an exclusive Fullscreen
   * DirectX surface at all (it bypasses the compositor) — only the full-screen capture path below sees it. */
  displayId?: number | null
}
export type VisionDebug = VisionReveal & { barWidth: number; barHeight: number; barPng: string; references: number; samples: (string | null)[] }
export type PortraitMemory = { hero: number; sample: string }

export const BAR_HEIGHT_FRACTION = 0.075
const leftCenters = [0.066, 0.141, 0.215, 0.290, 0.365]
const rightCenters = [0.634, 0.710, 0.785, 0.859, 0.934]
const referenceWindows = [
  [0, 1, 0, 1], [0.08, 0.92, 0.04, 0.96], [0.18, 0.82, 0.04, 0.96], [0.13, 0.87, 0.14, 0.86],
  [0.10, 0.80, 0.08, 0.93], [0.20, 0.90, 0.08, 0.93], [0.08, 0.92, 0.04, 0.80],
] as const
const THUMB = 16

function feature(crop: NativeImage) {
  if (crop.isEmpty()) return null
  const pixels = crop.resize({ width: THUMB, height: THUMB }).toBitmap()
  if (pixels.length !== THUMB * THUMB * 4) return null
  return pixelFeature(pixels)
}

function pixelFeature(pixels: Buffer) {
  const means = [0, 0, 0]
  for (let i = 0; i < pixels.length; i += 4) {
    means[0] += pixels[i]
    means[1] += pixels[i + 1]
    means[2] += pixels[i + 2]
  }
  return { pixels, mean: means.map((channel) => channel / (THUMB * THUMB)) }
}

function imageCrop(image: NativeImage, left: number, right: number, top: number, bottom: number) {
  const { width, height } = image.getSize()
  const x = Math.round(left * width)
  const y = Math.round(top * height)
  return image.crop({ x, y, width: Math.round(right * width) - x, height: Math.round(bottom * height) - y })
}

type Feature = NonNullable<ReturnType<typeof feature>>
const referenceCache = new Map<number, Feature[]>()
let referenceLoad: Promise<void> | null = null

async function referenceFeatures(heroSlug: string) {
  const base = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/'
  for (const path of ['heroes/' + heroSlug + '_sb.png', 'dota_react/heroes/' + heroSlug + '.png']) {
    try {
      const response = await fetch(base + path, { signal: AbortSignal.timeout(6000) })
      if (!response.ok) continue
      const image = nativeImage.createFromBuffer(Buffer.from(await response.arrayBuffer()))
      if (image.isEmpty()) continue
      const variants = referenceWindows.flatMap(([l, r, t, b]) => feature(imageCrop(image, l, r, t, b)) ?? [])
      if (variants.length) return variants
    } catch { /* Try the other Valve asset. */ }
  }
  return []
}

/** Only public Valve artwork is downloaded. Cache the normalized portraits for the app session. */
export function loadReferencePortraits(heroes: Hero[]) {
  referenceLoad ??= (async () => {
    const remaining = heroes.filter((hero) => !referenceCache.has(hero.id))[Symbol.iterator]()
    await Promise.all(Array.from({ length: 16 }, async () => {
      for (const hero of remaining) {
        const variants = await referenceFeatures(hero.slug)
        if (variants.length) referenceCache.set(hero.id, variants)
      }
    }))
  })().finally(() => { referenceLoad = null })
  return referenceLoad
}

function portraitDistance(a: Feature, b: Feature) {
  let total = 0
  const d0 = a.mean[0] - b.mean[0], d1 = a.mean[1] - b.mean[1], d2 = a.mean[2] - b.mean[2]
  for (let i = 0; i < a.pixels.length; i += 4) {
    const p0 = a.pixels[i] - b.pixels[i], p1 = a.pixels[i + 1] - b.pixels[i + 1], p2 = a.pixels[i + 2] - b.pixels[i + 2]
    total += Math.abs(p0) + Math.abs(p1) + Math.abs(p2) + Math.abs(p0 - d0) + Math.abs(p1 - d1) + Math.abs(p2 - d2)
  }
  return total / (6 * THUMB * THUMB)
}

function matchSlot(bar: NativeImage, center: number, layoutScale: number, learned: Map<number, Feature[]>, includeSample: boolean) {
  const candidates: Feature[] = []
  let sample: Feature | null = null
  for (const slide of [-0.003, 0, 0.003]) {
    for (const width of [0.038, 0.046, 0.052]) {
      for (const [top, bottom] of [[0.072, 0.857], [0.09, 0.75], [0.144, 0.647]]) {
        const x = center + slide * layoutScale
        const half = width * layoutScale / 2
        if (x - half < 0 || x + half > 1) continue
        const candidate = feature(imageCrop(bar, x - half, x + half, top, bottom))
        if (candidate) candidates.push(candidate)
        if (includeSample && slide === 0 && width === 0.046 && top === 0.09) sample = candidate
      }
    }
  }
  let id: number | null = null, best = Infinity, runnerUp = Infinity
  for (const hero of new Set([...referenceCache.keys(), ...learned.keys()])) {
    let score = Infinity
    for (const portrait of referenceCache.get(hero) ?? []) {
      for (const candidate of candidates) score = Math.min(score, portraitDistance(candidate, portrait))
    }
    // User-labelled variants use a tighter distance so new cosmetics don't get matched by color alone.
    for (const portrait of learned.get(hero) ?? []) {
      for (const candidate of candidates) {
        const distance = portraitDistance(candidate, portrait)
        if (distance < 12) score = Math.min(score, distance + 1)
      }
    }
    if (score < best) { runnerUp = best; best = score; id = hero }
    else if (score < runnerUp) runnerUp = score
  }
  const savedSample = sample
  const textured = savedSample && savedSample.pixels.some((value, index) =>
    index % 4 !== 3 && Math.abs(value - savedSample.mean[index % 4]) > 24)
  return { id: best < 24 && runnerUp - best >= 5 ? id : null, score: best,
    sample: textured && savedSample ? savedSample.pixels.toString('base64') : null }
}

export function rememberPortrait(records: PortraitMemory[], hero: number, sample: string): PortraitMemory[] {
  const feature = pixelFeature(Buffer.from(sample, 'base64'))
  return [{ hero, sample }, ...records.filter((record) => {
    const bytes = Buffer.from(record.sample, 'base64')
    return bytes.length === THUMB * THUMB * 4 && portraitDistance(feature, pixelFeature(bytes)) > 4
  })].slice(0, 60)
}

function readPickBar(bar: NativeImage, target: VisionTarget, includeSamples = false) {
  const learned = new Map<number, Feature[]>()
  for (const { hero, sample } of target.learned ?? []) {
    const pixels = Buffer.from(sample, 'base64')
    if (pixels.length !== THUMB * THUMB * 4) continue
    learned.set(hero, [...(learned.get(hero) ?? []), pixelFeature(pixels)])
  }
  const { width, height } = bar.getSize()
  const nominal = 16 / 9 * (height / BAR_HEIGHT_FRACTION) / width
  const scale = Math.max(0.68, Math.min(1, nominal))
  const layouts = scale < 0.96 ? [1, scale] : [1]
  const results = layouts.map((factor) => {
    const entries = [...leftCenters, ...rightCenters].map((center) => matchSlot(bar, 0.5 + (center - 0.5) * factor, factor, learned, includeSamples))
    const radiant = entries.slice(0, 5).map(({ id }) => id)
    const dire = entries.slice(5).map(({ id }) => id)
    const own = target.ownTeam === 'Radiant' ? radiant : dire
    const quality = entries.reduce((sum, entry) => sum + (entry.id == null ? 0 : 30 - entry.score), 0)
      + (target.ownHero != null && own.includes(target.ownHero) ? 35 : 0)
    return { radiant, dire, quality, samples: includeSamples ? entries.map((entry) => entry.sample) : [] }
  })
  const { radiant, dire, samples } = results.reduce((best, current) => current.quality > best.quality ? current : best)
  return { radiant, dire, samples }
}

export function confirmDraftPicks(previous: VisionReveal, current: VisionReveal, known: VisionReveal): VisionReveal {
  const confirmed = (before: Slots, after: Slots, accepted: Slots) =>
    after.map((id, index) => id != null && id === before[index] ? id : accepted[index] ?? null)
  return {
    radiant: confirmed(previous.radiant, current.radiant, known.radiant),
    dire: confirmed(previous.dire, current.dire, known.dire),
  }
}

export class DraftCaptureError extends Error {
  constructor(readonly reason: 'window' | 'thumbnail' | 'timeout') { super(reason) }
}

let pendingSources: ReturnType<typeof desktopCapturer.getSources> | null = null

function checkedBar(strip: NativeImage) {
  const { width, height } = strip.getSize()
  if (strip.isEmpty() || width < 2 || height < 2) throw new DraftCaptureError('thumbnail')
  const bitmap = strip.resize({ width: 16, height: 4 }).toBitmap()
  if (!bitmap.some((channel, index) => index % 4 !== 3 && channel > 8)) throw new DraftCaptureError('thumbnail')
  return strip
}

async function racedSources(types: ('window' | 'screen')[], width: number, height: number) {
  if (pendingSources) throw new DraftCaptureError('timeout')
  const operation = desktopCapturer.getSources({ types, thumbnailSize: { width, height } })
  pendingSources = operation
  const clearPending = () => { pendingSources = null }
  void operation.then(clearPending, clearPending)
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new DraftCaptureError('timeout')), 6000)
    })])
  } finally { clearTimeout(timeout) }
}

async function captureWindowBar(target: VisionTarget) {
  const scale = Math.min(1, 1600 / target.width, 1000 / target.height)
  const sources = await racedSources(['window'], Math.round(target.width * scale), Math.round(target.height * scale))
  if (!target.active()) return null
  const source = sources.find((candidate) => target.windowID != null
    ? candidate.id.startsWith(`window:${target.windowID}:`)
    : /^(?:dota\s*2|dota2)(?:$|\s*[-–—:(])/i.test(candidate.name.trim()))
  if (!source) throw new DraftCaptureError('window')
  const full = source.thumbnail
  const { width, height } = full.getSize()
  if (full.isEmpty() || width < 2 || height < 2) throw new DraftCaptureError('thumbnail')
  return checkedBar(full.crop({ x: 0, y: 0, width, height: Math.max(1, Math.round(height * BAR_HEIGHT_FRACTION)) }))
}

/** Windows-only fallback: an exclusive Fullscreen DirectX surface never reaches DWM, so the window-thumbnail
 * path above always sees either no window source or a blank/black thumbnail for it (checkedBar's all-near-zero
 * check catches that). The full-screen capture path reads the physical display buffer directly (desktop
 * duplication), which does see an exclusive-fullscreen game, so it can recover the same pick-bar strip — Dota
 * fills the whole monitor in that mode, so the crop fractions are identical to the window-thumbnail case. */
async function captureScreenBar(target: VisionTarget) {
  const scale = Math.min(1, 1600 / target.width, 1000 / target.height)
  const sources = await racedSources(['screen'], Math.round(target.width * scale), Math.round(target.height * scale))
  if (!target.active()) return null
  const source = (target.displayId != null ? sources.find((candidate) => String(candidate.display_id) === String(target.displayId)) : null)
    ?? (sources.length === 1 ? sources[0] : null)
  if (!source) throw new DraftCaptureError('window')
  const full = source.thumbnail
  const { width, height } = full.getSize()
  if (full.isEmpty() || width < 2 || height < 2) throw new DraftCaptureError('thumbnail')
  return checkedBar(full.crop({ x: 0, y: 0, width, height: Math.max(1, Math.round(height * BAR_HEIGHT_FRACTION)) }))
}

async function captureBar(target: VisionTarget) {
  if (target.readSharedBar) {
    const buffer = target.readSharedBar()
    if (!buffer) throw new DraftCaptureError('thumbnail')
    return checkedBar(nativeImage.createFromBuffer(buffer))
  }
  if (target.requireWindowID && target.windowID == null) throw new DraftCaptureError('window')
  try {
    return await captureWindowBar(target)
  } catch (error) {
    if (process.platform === 'win32' && error instanceof DraftCaptureError && error.reason !== 'timeout') return await captureScreenBar(target)
    throw error
  }
}

export async function captureDraftPicks(inPickPhase: boolean, target: VisionTarget): Promise<VisionReveal | null> {
  if (!inPickPhase) return null
  if (!target.active()) return null
  const bar = await captureBar(target)
  if (!bar) return null
  return target.active() ? readPickBar(bar, target) : null
}

/** The dashboard previews exactly the same portrait strip and matches the live overlay uses. */
export async function debugCaptureDraftPicks(inPickPhase: boolean, target: VisionTarget): Promise<VisionDebug | null> {
  if (!inPickPhase) return null
  if (!target.active()) return null
  const bar = await captureBar(target)
  if (!bar || !target.active()) return null
  const { width, height } = bar.getSize()
  return { ...readPickBar(bar, target, true), references: referenceCache.size, barWidth: width, barHeight: height, barPng: bar.toDataURL() }
}
