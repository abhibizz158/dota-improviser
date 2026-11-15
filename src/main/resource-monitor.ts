import os from 'node:os'

/** 16GB free is the line between "plenty of headroom, run every overlay extra at full strength" and "this
 * machine is tight, trim the decorative/compositing cost automatically." Pure function so it's unit-testable
 * without booting Electron, same pattern as overlay-layout.ts. */
export const RESOURCE_THRESHOLD_BYTES = 16 * 1024 ** 3
export type ResourceMode = 'full' | 'minimal'
export function pickResourceMode(freeBytes: number): ResourceMode {
  return freeBytes >= RESOURCE_THRESHOLD_BYTES ? 'full' : 'minimal'
}

export type ResourceSample = {
  ts: number; mode: ResourceMode; rssMB: number; freeMemMB: number; totalMemMB: number; cpuPercent: number; overlayWindows: number
}
/** Ring buffer: drop the oldest sample once over the cap instead of growing forever. */
export function trimSamples(samples: ResourceSample[], max: number): ResourceSample[] {
  return samples.length > max ? samples.slice(samples.length - max) : samples
}

// Checking every 5s was itself the kind of "bombarding with resource checking" overhead this module exists to
// avoid adding — a plain os.freemem()/process.cpuUsage() read is cheap, but there's no reason to pay even that
// 12x more often than the resource mode it drives could possibly need to react. 30s is still responsive enough
// for a mode flip to matter, and keeps the 1-hour log at a much smaller sample count.
const MAX_SAMPLES = 120 // 1 hour at the 30s sampling interval below
const SAMPLE_MS = 30_000

let samples: ResourceSample[] = []
let timer: NodeJS.Timeout | undefined
let lastCpu = process.cpuUsage()
let lastCpuAt = Date.now()
let mode: ResourceMode = pickResourceMode(os.freemem())

/** Started once from app.whenReady(); `countOverlayWindows` is passed in rather than imported so this module
 * never needs to know about BrowserWindow bookkeeping, just how many are up right now. */
export function start(countOverlayWindows: () => number) {
  stop()
  timer = setInterval(() => {
    const now = Date.now()
    const cpu = process.cpuUsage()
    const elapsedMs = now - lastCpuAt
    const cpuPercent = elapsedMs > 0 ? 100 * ((cpu.user - lastCpu.user) + (cpu.system - lastCpu.system)) / 1000 / elapsedMs : 0
    lastCpu = cpu
    lastCpuAt = now
    const freeMem = os.freemem()
    mode = pickResourceMode(freeMem)
    samples = trimSamples([...samples, {
      ts: now, mode, rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024), freeMemMB: Math.round(freeMem / 1024 / 1024),
      totalMemMB: Math.round(os.totalmem() / 1024 / 1024), cpuPercent: Math.round(cpuPercent * 10) / 10, overlayWindows: countOverlayWindows(),
    }], MAX_SAMPLES)
  }, SAMPLE_MS)
  timer.unref()
}

export function stop() {
  clearInterval(timer)
  timer = undefined
}

export function currentMode(): ResourceMode {
  return mode
}

export function snapshot(): ResourceSample[] {
  return [...samples]
}
