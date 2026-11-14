import { desktopCapturer, nativeImage } from 'electron'
import type { NativeImage } from 'electron'
import type { Hero } from '../shared/model.js'

/**
 * STRICT GATE: this is the ONLY screen-reading code in the entire app, and every entry point into it takes an
 * explicit `inPickPhase` boolean that the caller must derive from Dota's own GSI game_state (hero selection,
 * strategy time, or the captains-mode draft) — never from guesswork, and never once a match is live. It reads a
 * single cropped strip at the top of the Dota window (the pick-bar portraits) and compares it against Valve's own
 * public hero art fetched from Steam's CDN; it never performs text OCR, never reads chat, the minimap, buildings,
 * or anything outside that one strip, and never runs once `inPickPhase` is false. See AGENTS.md's "Draft vision"
 * section for the full scope, the resolution/UI-scale limitation this shares with every portrait-matching overlay
 * in this space, and why this one narrow exception exists against the app's own no-screen-capture default.
 */
export type VisionReveal = { radiant: number[]; dire: number[] }
export type VisionTarget = { windowID?: number | null; width: number; height: number; active: () => boolean }
export type VisionDebug = { barWidth: number; barHeight: number; barPng: string; radiant: (number | null)[]; dire: (number | null)[] }

// Strategy screen portraits sit in groups anchored to either side of the central clock.
const BAR_HEIGHT_FRACTION = 0.075
function slotRects(barWidth: number, barHeight: number) {
  const width = Math.max(1, Math.round(barWidth * 0.059))
  const height = Math.max(1, Math.round(barHeight * 0.74))
  const y = Math.round(barHeight * 0.11)
  const centers = [0.068, 0.142, 0.216, 0.29, 0.366]
  const rect = (x: number) => ({ x: Math.max(0, Math.round(x * barWidth - width / 2)), y, width, height })
  return { radiant: centers.map(rect), dire: centers.map((center) => rect(1 - center)).reverse() }
}

const referenceCache = new Map<number, Buffer>()
let referenceLoad: Promise<void> | null = null
const THUMB = 20 // tiny compare size: cheap, and tolerant of a few pixels of crop drift

async function referenceBitmap(heroSlug: string): Promise<Buffer | null> {
  try {
    const response = await fetch('https://cdn.cloudflare.steamstatic.com/apps/dota2/images/heroes/' + heroSlug + '_sb.png', { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    return nativeImage.createFromBuffer(buffer).resize({ width: THUMB, height: THUMB }).toBitmap()
  } catch { return null }
}

/** Fetches and caches Valve's own small hero icons once (same art already used for the app's own portrait grid) —
 * call this ahead of time (e.g. once the hero catalog loads), not per capture. Never gated on pick phase itself:
 * it's a one-time asset download, not a screen read. */
export async function loadReferencePortraits(heroes: Hero[]) {
  referenceLoad ??= (async () => {
    const remaining = heroes.filter((hero) => !referenceCache.has(hero.id))[Symbol.iterator]()
    await Promise.all(Array.from({ length: 8 }, async () => {
      for (const hero of remaining) {
        const bitmap = await referenceBitmap(hero.slug)
        if (bitmap?.length === THUMB * THUMB * 4) referenceCache.set(hero.id, bitmap)
      }
    }))
  })().finally(() => { referenceLoad = null })
  return referenceLoad
}

function pixelDiff(a: Buffer, b: Buffer) {
  let total = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i + 2 < n; i += 4) total += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
  return total / Math.max(1, n / 4)
}

/** Loose threshold: an empty pick slot (still grey/blank art) and a real hero portrait differ by a wide margin,
 * so this comfortably tells "nothing picked yet" from "a hero is picked" without needing a tighter, more
 * resolution-sensitive cutoff. */
const MATCH_THRESHOLD = 42

function matchSlot(crop: NativeImage): number | null {
  if (!referenceCache.size) return null
  const bitmap = crop.resize({ width: THUMB, height: THUMB }).toBitmap()
  let best: number | null = null, bestScore = Infinity, secondScore = Infinity
  for (const [heroId, reference] of referenceCache) {
    const score = pixelDiff(bitmap, reference)
    if (score < bestScore) { secondScore = bestScore; bestScore = score; best = heroId }
    else if (score < secondScore) secondScore = score
  }
  return bestScore < MATCH_THRESHOLD && secondScore - bestScore >= 2 ? best : null
}

export class DraftCaptureError extends Error {
  constructor(readonly reason: 'window' | 'thumbnail' | 'timeout') { super(reason) }
}

async function captureBar(target: VisionTarget) {
  const scale = Math.min(1, 1600 / target.width, 1000 / target.height)
  const operation = desktopCapturer.getSources({
    types: ['window'], thumbnailSize: { width: Math.round(target.width * scale), height: Math.round(target.height * scale) },
  })
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const sources = await Promise.race([operation, new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new DraftCaptureError('timeout')), 6000)
    })])
    if (!target.active()) return null
    const source = sources.find((candidate) => target.windowID != null
      ? candidate.id === `window:${target.windowID}:0`
      : /^(?:dota\s*2|dota2)(?:$|\s*[-–—:(])/i.test(candidate.name.trim()))
    if (!source) throw new DraftCaptureError('window')
    const full = source.thumbnail
    const { width, height } = full.getSize()
    if (full.isEmpty() || width < 2 || height < 2) throw new DraftCaptureError('thumbnail')
    const strip = full.crop({ x: 0, y: 0, width, height: Math.max(1, Math.round(height * BAR_HEIGHT_FRACTION)) })
    const bitmap = strip.resize({ width: 16, height: 4 }).toBitmap()
    if (!bitmap.some((channel, index) => index % 4 !== 3 && channel > 8)) throw new DraftCaptureError('thumbnail')
    return strip
  } finally { clearTimeout(timeout) }
}

export async function captureDraftPicks(inPickPhase: boolean, target: VisionTarget): Promise<VisionReveal | null> {
  if (!inPickPhase) return null
  if (!target.active()) return null
  const bar = await captureBar(target)
  if (!bar) return null
  const { width, height } = bar.getSize()
  const { radiant, dire } = slotRects(width, height)
  const read = (rects: ReturnType<typeof slotRects>['radiant']) => rects.map((rect) => matchSlot(bar.crop(rect))).filter((id): id is number => id != null)
  return { radiant: read(radiant), dire: read(dire) }
}

/** For the Settings "Test draft vision" button: same capture/match as above, but returns the cropped strip itself
 * (as a PNG data URL) plus every slot's match-or-null, so a person can see exactly what the app saw and whether
 * the slot positions need retuning for their resolution — the live-calibration path this feature needs instead
 * of a fixed per-resolution lookup table. */
export async function debugCaptureDraftPicks(inPickPhase: boolean, target: VisionTarget): Promise<VisionDebug | null> {
  if (!inPickPhase) return null
  if (!target.active()) return null
  const bar = await captureBar(target)
  if (!bar) return null
  const { width, height } = bar.getSize()
  const { radiant, dire } = slotRects(width, height)
  return {
    barWidth: width, barHeight: height, barPng: bar.toDataURL(),
    radiant: radiant.map((rect) => matchSlot(bar.crop(rect))), dire: dire.map((rect) => matchSlot(bar.crop(rect))),
  }
}
