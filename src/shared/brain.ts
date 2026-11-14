import type { Hero, MatchReview, MatchSummary, Matchups, Role } from './model.js'
import { roleFit } from './analysis.js'
import { allyCombination, counterInteraction } from './draft-reasons.js'
import type { FeatureName, Kit, MechModel } from './mechanics.js'

// Win-rate blend for "my hero C vs enemy E". Sources, strongest-first:
//  live  = fresh OpenDota aggregate (fetched this session / cached <24h)
//  seed  = bundled pre-learned table (data/seed.json), halved in weight once the game patched past it
//  you   = your own saved matches, recency-decayed, weighted x3 (rare but personal)
//  manual= user nudges in win-rate points, halved when stale after a patch
export type Seed = { patch: string; builtAt: number; matchups: Record<number, [number, number, number][]> }
export type Count = { g: number; w: number }
export type HeroStats = { n: number; gpm: number; xpm: number; lhpm: number }
export type Profile = { heroes: Record<number, Count>; pairs: Record<string, Count>; stats?: Record<number, HeroStats>; roles?: Record<number, Partial<Record<Role, number>>> }
/** Per-user blend weights, fitted from your own history (see fitWeights). Defaults until enough data. */
export type Weights = { comfort: number; fit: number; samples: number }
export const defaultWeights: Weights = { comfort: 0.5, fit: 2, samples: 0 }
export type Overrides = Record<string, number> // key `${mine}:${enemy}` -> delta points, clamped ±15
export type Why = { enemy: number; rate: number; games: number; source: 'live' | 'seed' | 'you' | 'prior' | 'mechanics'; edge: number; mech?: number; reason?: string }
export type Suggestion = {
  heroId: number; teamWin: number | null; score: number; winRate: number | null; games: number; fit: boolean; fitScore: number
  confidence: number; comfort: number | null; why: Why[]
  /** matchup-specific edge in points vs what overall strengths predict; base = hero's overall win rate % */
  edge: number | null; base: number | null; comp: number; synergy?: string
  build?: { early: string[]; mid: string[]; late: string[] }
  /** matchup edge the game's mechanics predict (points), with the biggest contributors */
  mech?: { edge: number; parts: { label: FeatureName; points: number }[] }
}
export type BrainInput = {
  heroes: Hero[]; role: Role; enemy: number[]; allied: number[]; pool: number[]; banned?: number[]
  seed: Seed | null; live: Matchups; profile: Profile; overrides: Overrides; stale: boolean; weights?: Weights; changed?: number[]
  mech?: MechModel | null // mechanics model, used as the prior for each matchup
  base?: Record<number, number> // overall win rate per hero, 0..1
  kits?: Record<number, Kit>
  levels?: Record<number, number[]> // Valve role levels per hero
}

const K = 120 // prior strength in pseudo-games, centred on the pair's expected win rate
const PERSONAL_W = 3
const HALF_LIFE_DAYS = 120
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
export const pairKey = (mine: number, enemy: number) => mine + ':' + enemy

const indexCache = new WeakMap<Seed, Map<number, Map<number, [number, number]>>>()
export function seedIndex(seed: Seed | null) {
  const cached = seed && indexCache.get(seed)
  if (cached) return cached
  const index = new Map<number, Map<number, [number, number]>>()
  for (const [hero, rows] of Object.entries(seed?.matchups ?? {})) {
    index.set(Number(hero), new Map(rows.map(([enemy, g, w]) => [enemy, [g, w]])))
  }
  if (seed) indexCache.set(seed, index)
  return index
}

const PATCH_KEEP = 0.65 // each patch older than the current one keeps 65% of its weight: old-meta results fade as the game changes

/** Recompute personal profile from scratch: idempotent (no migrations). Weight = recency x patch freshness. */
export function learnProfile(history: MatchSummary[], reviews: MatchReview[], account: string, now = Date.now(), patches: string[] = []): Profile {
  const profile: Profile = { heroes: {}, pairs: {}, stats: {}, roles: {} }
  const latest = patches.length - 1
  const behind = (patch?: string) => { const i = patch ? patches.indexOf(patch) : -1; return i < 0 || latest < 0 ? 0 : Math.max(0, latest - i) }
  const decay = (start: number, patch?: string) => 0.5 ** (Math.max(0, now / 1000 - start) / 86400 / HALF_LIFE_DAYS) * PATCH_KEEP ** behind(patch)
  const sums: Record<number, { w: number; gpm: number; xpm: number; lhpm: number }> = {}
  const add = (table: Record<string | number, Count>, key: string | number, weight: number, won: boolean) => {
    const c = (table[key] ??= { g: 0, w: 0 })
    c.g += weight
    if (won) c.w += weight
  }
  for (const match of history) {
    const w = decay(match.start, match.patch)
    if (match.won != null) add(profile.heroes, match.heroId, w, match.won)
    if (match.role) { const r = (profile.roles![match.heroId] ??= {}); r[match.role] = (r[match.role] ?? 0) + w }
    if (match.gpm != null && match.xpm != null && match.lastHits != null && match.duration >= 600) {
      const s = (sums[match.heroId] ??= { w: 0, gpm: 0, xpm: 0, lhpm: 0 })
      s.w += w; s.gpm += w * match.gpm; s.xpm += w * match.xpm; s.lhpm += w * match.lastHits / (match.duration / 60)
    }
  }
  for (const [hero, s] of Object.entries(sums)) profile.stats![Number(hero)] = { n: s.w, gpm: s.gpm / s.w, xpm: s.xpm / s.w, lhpm: s.lhpm / s.w }
  for (const review of reviews) {
    const me = review.players.find((p) => p.accountId === account)
    if (!me || me.won == null) continue
    const weight = decay(review.start, review.patch)
    for (const enemy of review.players) if (enemy.side !== me.side) add(profile.pairs, pairKey(me.heroId, enemy.heroId), weight, me.won)
  }
  return profile
}

// Valve role levels, in this order: Carry, Support, Nuker, Disabler, Jungler, Durable, Escape, Pusher, Initiator (0-3 each).
const POSITION_W: Record<Role, number[]> = {
  Carry: [1, 0, 0, 0, 0, 0, .25, 0, 0],
  Mid: [.5, 0, .7, .2, 0, 0, .4, .2, 0],
  Offlane: [0, 0, .1, .3, 0, 1, 0, .1, .8],
  'Soft support': [0, .7, .4, .5, 0, 0, .3, 0, .5],
  'Hard support': [0, 1, .3, .4, 0, 0, 0, 0, .1],
}
// What a balanced five-hero team adds up to, per role dimension. Missing pieces make a hero that supplies them more valuable.
const TEAM_TARGET = [3, 4, 3, 4, 0, 3, 2, 0, 3]
const COMP_POINTS = 5 // max points composition can add to a pick's score

/** How well a hero's Valve role levels fit a position, 0..1 (falls back to catalogue tags when levels are unavailable). */
export function positionFit(hero: Hero, role: Role, levels?: number[]) {
  if (!levels || levels.length < 9) return roleFit(hero, role) ? 0.7 : 0.2
  const w = POSITION_W[role]
  const raw = w.reduce((sum, wi, i) => sum + wi * levels[i], 0)
  return clamp(raw / (3 * w.reduce((a, b) => a + b, 0)), 0, 1)
}

/** Points a hero adds by supplying roles the allied picks still lack. 0 until two allies are known. */
export function compositionPoints(levels: number[] | undefined, allyLevels: number[][]) {
  if (!levels || levels.length < 9 || allyLevels.length < 2) return 0
  const have = TEAM_TARGET.map((_, i) => allyLevels.reduce((s, l) => s + (l[i] ?? 0), 0))
  let gain = 0, total = 0
  TEAM_TARGET.forEach((target, i) => {
    if (!target) return
    const need = Math.max(0, target - have[i]) / target
    gain += need * (levels[i] / 3); total += 1
  })
  return clamp(COMP_POINTS * (2 * (gain / total) - 0.5) * Math.min(1, allyLevels.length / 3), -2.5, COMP_POINTS)
}

type Pair = { g: number; w: number; source: Why['source'] }

function rankAll(input: BrainInput): Suggestion[] {
  const { heroes, role, enemy, allied, pool, seed, live, profile, overrides, stale } = input
  const index = seedIndex(seed)
  const base = (id: number) => input.base?.[id] ?? 0.5
  const picked = new Set([...enemy, ...allied, ...(input.banned ?? [])])
  const staleFactor = stale ? 0.5 : 1
  const changed = new Set(input.changed ?? [])
  const weights = input.weights ?? defaultWeights
  const kPrior = input.mech?.k ?? K
  const byId = new Map(heroes.map((hero) => [hero.id, hero]))
  const eligible = new Set(pool)
  const enemyIds = [...new Set(enemy)]
  const liveRows = new Map(enemyIds.map((id) => [id, new Map(live[id]?.map((row) => [row.heroId, row]))]))
  const allies = allied.flatMap((id) => {
    const hero = byId.get(id)
    return hero ? [{ hero, kit: input.kits?.[id] }] : []
  })
  const allyRows = allied.map((id) => input.levels?.[id]).filter((l): l is number[] => Boolean(l))

  const pairOf = (hero: Hero, e: number): Pair => {
    const liveRow = liveRows.get(e)?.get(hero.id) // wins are the ENEMY's
    const seedRow = index.get(hero.id)?.get(e)
    let g = 0, w = 0, source: Pair['source'] = 'prior'
    if (liveRow && liveRow.games >= 20) { g = liveRow.games; w = liveRow.games - liveRow.wins; source = 'live' }
    else if (seedRow) {
      const f = staleFactor * (changed.has(hero.id) || changed.has(e) ? 0.6 : 1) // a hero rebalanced recently: old pair data counts less
      g = seedRow[0] * f; w = seedRow[1] * f; source = 'seed'
    }
    const mine = profile.pairs[pairKey(hero.id, e)]
    if (mine) { g += mine.g * PERSONAL_W; w += mine.w * PERSONAL_W; if (source === 'prior') source = 'you' }
    return { g, w, source }
  }

  return heroes.filter((h) => !picked.has(h.id) && (!eligible.size || eligible.has(h.id))).map((hero) => {
    const levels = input.levels?.[hero.id]
    const fitScore = positionFit(hero, role, levels)
    const why: Why[] = []
    let interactionPoints = 0
    const mechParts = new Map<FeatureName, number>()
    for (const e of enemyIds) {
      const { g, w, source } = pairOf(hero, e)
      // Expected win rate from the two heroes' overall strength. Shrinking toward THIS (not 50%) keeps strong heroes from looking like counters to everyone.
      const expected = clamp(0.5 + (base(hero.id) - base(e)), 0.35, 0.65)
      // The prior is centred on what overall strength AND the game's mechanics predict. Lots of real games override it; no games leave only the mechanics.
      const m = input.mech?.predict(hero.id, e)
      const prior = clamp(expected + (m?.edge ?? 0) / 100, 0.3, 0.7)
      const p = (w + kPrior * prior) / (g + kPrior)
      const nudge = clamp(overrides[pairKey(hero.id, e)] ?? 0, -15, 15) * staleFactor / 100
      why.push({ enemy: e, rate: clamp(p + nudge, 0, 1), games: Math.round(g), source: source === 'prior' && m ? 'mechanics' : source, edge: 100 * (p + nudge - expected), mech: m?.edge })
      const interaction = counterInteraction(hero, byId.get(e), input.kits?.[hero.id], input.kits?.[e])
      if (interaction && (g < 150 || why[why.length - 1].edge >= -2)) {
        why[why.length - 1].reason = interaction.text
        interactionPoints = Math.max(interactionPoints, interaction.points * (g >= 150 ? 0.7 : 1))
      }
      if (m) for (const part of m.parts) mechParts.set(part.label, (mechParts.get(part.label) ?? 0) + part.points)
    }
    const games = why.reduce((s, x) => s + x.games, 0)
    const mean = (f: (x: Why) => number) => why.length ? why.reduce((s, x) => s + f(x), 0) / why.length : 0
    const edge = why.length ? mean((x) => x.edge) : null
    const counter = why.length ? 0.6 * mean((x) => x.edge) + 0.4 * mean((x) => (x.rate - 0.5) * 100) : 0
    const meta = (base(hero.id) - 0.5) * 100 * 0.25
    const mine = profile.heroes[hero.id]
    const comfort = mine && mine.g >= 3 ? ((mine.w + 5) / (mine.g + 10) - 0.5) * 100 : null
    const combo = allyCombination(hero, input.kits?.[hero.id], allies)
    const comp = compositionPoints(levels, allyRows) + (combo?.points ?? 0)
    const fitPts = (fitScore - 0.45) * 6 * weights.fit
    const score = counter + meta + comp + fitPts + interactionPoints + (comfort ?? 0) * weights.comfort
    return {
      heroId: hero.id, teamWin: teamWinProb([...allied, hero.id], enemy, index, input.base), score, fit: fitScore >= 0.4, fitScore, comfort, why, games,
      edge, base: input.base ? base(hero.id) * 100 : null, comp, synergy: combo?.text,
      mech: input.mech && why.length ? { edge: mean((x) => x.mech ?? 0), parts: [...mechParts].map(([label, points]) => ({ label, points: points / why.length })).filter((p) => Math.abs(p.points) >= 0.05).sort((a, b) => Math.abs(b.points) - Math.abs(a.points)).slice(0, 4) } : undefined,
      winRate: why.length ? 100 * mean((x) => x.rate) : null,
      confidence: clamp(games / (K * Math.max(1, enemy.length)), 0, 1),
    }
  }).sort((a, b) => b.score - a.score || b.games - a.games)
}

function bestPicks(all: Suggestion[], input: BrainInput, limit: number) {
  return (input.pool.length ? all : all.filter((suggestion) => suggestion.fitScore >= 0.2)).slice(0, limit)
}

function worstPicks(all: Suggestion[], limit: number) {
  return all.filter((suggestion) => suggestion.fitScore >= 0.4 && suggestion.games >= 150 &&
    (suggestion.winRate ?? 50) < 50 && (suggestion.edge ?? 0) < -0.5).slice(-limit).reverse()
}

export function suggest(input: BrainInput, limit = 10): Suggestion[] {
  return bestPicks(rankAll(input), input, limit)
}

export function avoid(input: BrainInput, limit = 3): Suggestion[] {
  return input.enemy.length ? worstPicks(rankAll(input), limit) : []
}

export function draftRanks(input: BrainInput, best: number, worst: number) {
  const ranked = rankAll(input)
  return { suggestions: bestPicks(ranked, input, best), avoid: input.enemy.length ? worstPicks(ranked, worst) : [] }
}

/** Mean pairwise win rate of my team's heroes vs each enemy hero, shrunk toward what their overall strengths predict. Rough estimate, not a prediction of skill or itemisation. */
export function teamWinProb(mine: number[], enemy: number[], index: ReturnType<typeof seedIndex>, base?: Record<number, number>, k = K): number | null {
  const rates = mine.flatMap((a) => enemy.flatMap((e) => {
    const row = index.get(a)?.get(e)
    if (!row) return []
    const expected = clamp(0.5 + ((base?.[a] ?? 0.5) - (base?.[e] ?? 0.5)), 0.35, 0.65)
    return [(row[1] + k * expected) / (row[0] + k)]
  }))
  return rates.length ? 100 * rates.reduce((s, r) => s + r, 0) / rates.length : null
}

/** Seed older than the installed game build, or built on an older dotaconstants patch than the catalog. */
export function seedStale(seed: Seed | null, installedDate: number | null, catalogPatch: string) {
  if (!seed) return true
  return (installedDate != null && installedDate > seed.builtAt) || seed.patch !== catalogPatch
}

export type Sample = { counter: number; comfort: number; won: boolean }

/** Training rows from your saved matches: how strong the seed counter edge and your hero comfort looked, and whether you won. */
export function buildSamples(reviews: MatchReview[], account: string, index: ReturnType<typeof seedIndex>, profile: Profile): Sample[] {
  return reviews.flatMap((review) => {
    const me = review.players.find((p) => p.accountId === account)
    if (!me || me.won == null) return []
    const rates = review.players.filter((p) => p.side !== me.side).flatMap((e) => {
      const row = index.get(me.heroId)?.get(e.heroId)
      return row ? [(row[1] + K / 2) / (row[0] + K) - 0.5] : []
    })
    const h = profile.heroes[me.heroId]
    if (!rates.length || !h || h.g < 3) return []
    return [{ counter: rates.reduce((s, r) => s + r, 0) / rates.length * 100, comfort: ((h.w + 5) / (h.g + 10) - 0.5) * 100, won: me.won }]
  })
}

/**
 * Fit a 2-feature logistic regression (counter edge, comfort) on your own outcomes, L2-pulled toward the defaults,
 * then express comfort relative to counter. Needs 25+ samples; otherwise stays on defaults. Bounded to [0.1, 1.5].
 */
export function fitWeights(samples: Sample[]): Weights {
  if (samples.length < 25) return { ...defaultWeights, samples: samples.length }
  let bc = 0.1, bm = 0.05 // priors: counter edge matters, comfort about half as much
  const lr = 0.05, lambda = 0.02
  for (let step = 0; step < 400; step++) {
    let gc = 0, gm = 0
    for (const x of samples) {
      const p = 1 / (1 + Math.exp(-(bc * x.counter + bm * x.comfort)))
      const err = (x.won ? 1 : 0) - p
      gc += err * x.counter; gm += err * x.comfort
    }
    bc += lr * (gc / samples.length - lambda * (bc - 0.1))
    bm += lr * (gm / samples.length - lambda * (bm - 0.05))
  }
  const ratio = bc > 0.02 ? bm / bc : defaultWeights.comfort
  return { ...defaultWeights, comfort: clamp(ratio, 0.1, 1.5), samples: samples.length }
}
