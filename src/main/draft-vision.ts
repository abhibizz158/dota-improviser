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
export type VisionDebug = { barWidth: number; barHeight: number; barPng: string; radiant: (number | null)[]; dire: (number | null)[] }

// Fractions of the captured window, not fixed pixels, calibrated against a 16:9 All Pick / ranked draft screen.
// A genuinely different aspect ratio (ultrawide, 4:3) or a resized/rescaled Dota UI may need these retuned —
// that is the one real limitation every portrait-matching draft overlay in this space documents (counterdraft,
// dota-counterpick-overlay); there is no way to eliminate it without per-user calibration.
const BAR_HEIGHT_FRACTION = 0.065
const SLOT_WIDTH_FRACTION = 0.036
const SLOT_GAP_FRACTION = 0.001
const RADIANT_START_FRACTION = 0.085
const DIRE_END_FRACTION = 0.915

function slotRects(barWidth: number, barHeight: number) {
  const slotW = Math.max(1, Math.round(barWidth * SLOT_WIDTH_FRACTION))
  const gap = Math.round(barWidth * SLOT_GAP_FRACTION)
  const radiant = Array.from({ length: 5 }, (_, i) => ({ x: Math.round(barWidth * RADIANT_START_FRACTION) + i * (slotW + gap), y: 0, width: slotW, height: barHeight }))
  const dire = Array.from({ length: 5 }, (_, i) => ({ x: Math.round(barWidth * DIRE_END_FRACTION) - (5 - i) * (slotW + gap), y: 0, width: slotW, height: barHeight }))
  return { radiant, dire }
}

const referenceCache = new Map<number, Buffer>()
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
  await Promise.all(heroes.filter((hero) => !referenceCache.has(hero.id)).map(async (hero) => {
    const bitmap = await referenceBitmap(hero.slug)
    if (bitmap) referenceCache.set(hero.id, bitmap)
  }))
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
  let best: number | null = null, bestScore = Infinity
  for (const [heroId, reference] of referenceCache) {
    const score = pixelDiff(bitmap, reference)
    if (score < bestScore) { bestScore = score; best = heroId }
  }
  return bestScore < MATCH_THRESHOLD ? best : null
}

async function captureBar(dotaBounds: { width: number; height: number }) {
  const sources = await desktopCapturer.getSources({
    types: ['window'], thumbnailSize: { width: Math.min(1920, Math.max(1, dotaBounds.width)), height: Math.min(1080, Math.max(1, dotaBounds.height)) },
  })
  // Match case-insensitively and tolerate a trailing build/branch suffix some platforms add to the window
  // title (e.g. "Dota 2 - 7.39"); explicitly exclude names containing "improviser" so this can never match one
  // of this app's own windows, which desktopCapturer enumerates right alongside every other open window.
  const source = sources.find((s) => {
    const name = s.name.trim().toLowerCase()
    return name.startsWith('dota 2') && !name.includes('improviser')
  })
  if (!source) return null
  const full = source.thumbnail
  const { width, height } = full.getSize()
  if (width < 2 || height < 2) return null
  return full.crop({ x: 0, y: 0, width, height: Math.max(1, Math.round(height * BAR_HEIGHT_FRACTION)) })
}

export async function captureDraftPicks(inPickPhase: boolean, dotaBounds: { width: number; height: number }): Promise<VisionReveal | null> {
  if (!inPickPhase) return null
  const bar = await captureBar(dotaBounds)
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
export async function debugCaptureDraftPicks(inPickPhase: boolean, dotaBounds: { width: number; height: number }): Promise<VisionDebug | null> {
  if (!inPickPhase) return null
  const bar = await captureBar(dotaBounds)
  if (!bar) return null
  const { width, height } = bar.getSize()
  const { radiant, dire } = slotRects(width, height)
  return {
    barWidth: width, barHeight: height, barPng: bar.toDataURL(),
    radiant: radiant.map((rect) => matchSlot(bar.crop(rect))), dire: dire.map((rect) => matchSlot(bar.crop(rect))),
  }
}
