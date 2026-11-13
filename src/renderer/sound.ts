let ctx: AudioContext | null = null

/** A short synthesized chime (no bundled audio file) for an awarded achievement. */
export function playAchievementChime() {
  try {
    ctx ??= new AudioContext()
    const now = ctx.currentTime
    for (const [i, freq] of [660, 880, 1320].entries()) {
      const osc = ctx.createOscillator(), gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, now + i * 0.09)
      gain.gain.linearRampToValueAtTime(0.18, now + i * 0.09 + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.28)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + i * 0.09)
      osc.stop(now + i * 0.09 + 0.3)
    }
  } catch { /* no audio output available yet (e.g. no user gesture) */ }
}
