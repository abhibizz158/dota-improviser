// Manual Roshan/Aegis stopwatch. The player starts it themselves (a hotkey or button) when they see Roshan die —
// this reads no game state at all, just like typing a draft pick. Nothing here touches GSI or any hidden data.
export type RoshanState = { roshanAt: number | null; aegisAt: number | null }
export const emptyRoshan: RoshanState = { roshanAt: null, aegisAt: null }

// Current approximate respawn window and Aegis expiry. Valve has changed these before; treat as an estimate.
export const ROSHAN_MIN_MS = 8 * 60_000
export const ROSHAN_MAX_MS = 11 * 60_000
export const AEGIS_MS = 5 * 60_000

export type RoshanView = { state: 'waiting' | 'open' | 'unknown'; minLeft: number | null; maxLeft: number | null }
export type AegisView = { left: number | null; expired: boolean }

/** Time left (ms) until Roshan's window opens, and until it is guaranteed to have respawned. null once there's nothing to show. */
export function roshanView(roshanAt: number | null, now: number): RoshanView {
  if (roshanAt == null) return { state: 'unknown', minLeft: null, maxLeft: null }
  const minLeft = roshanAt + ROSHAN_MIN_MS - now, maxLeft = roshanAt + ROSHAN_MAX_MS - now
  if (maxLeft <= 0) return { state: 'unknown', minLeft: null, maxLeft: null } // window passed; stop claiming to know anything
  return { state: minLeft > 0 ? 'waiting' : 'open', minLeft: Math.max(0, minLeft), maxLeft }
}

export function aegisView(aegisAt: number | null, now: number): AegisView {
  if (aegisAt == null) return { left: null, expired: false }
  const left = aegisAt + AEGIS_MS - now
  return left <= 0 ? { left: 0, expired: true } : { left, expired: false }
}

export const clockText = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }
