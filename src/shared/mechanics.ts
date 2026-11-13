import type { Seed } from './brain.js'

// ---- Dota 2 core mechanics, as a model -----------------------------------------------------------------------------
// COMPUTED from the rules (exact): attribute scaling, armor and magic resistance, attack time, damage per second, durability.
// INFERRED from Valve text: which abilities stun, silence, mute, root, hex, disarm... (keyword tagging of the ability text).
// LEARNED from public matches: how much each mechanic actually moves win rates (ridge regression over every hero pair).
// The learned part is what keeps the formula honest: a mechanic only counts as much as real games say it does.

export type Status = 'stun' | 'silence' | 'mute' | 'root' | 'hex' | 'disarm' | 'slow' | 'fear' | 'taunt' | 'sleep' | 'knockback' | 'blind' | 'break' | 'invis' | 'heal' | 'dispel' | 'barrier' | 'evasion'

// KEEP in sync with STATUS_RE in scripts/build-kits.mjs (tests compare them).
export const STATUS_RE: Record<Status, string> = {
  stun: '\\bstun|\\bdisabling\\b', silence: '\\bsilenc|\\b(prevent|stop)s? [^.]{0,40}\\bcasting\\b|\\bcan(no|\')t cast\\b|\\bunable to cast\\b',
  mute: '\\bmut(e|ed|es|ing)\\b|\\b(disables?|prevent|stops?)[^.]{0,30}\\bitems?\\b', root: '\\broot(s|ed|ing)?\\b|\\bensnar|\\bentangl|\\bimmobiliz',
  hex: '\\bhex(es|ed)?\\b|\\bturns?\\b[^.]{0,30}\\binto a\\b|\\bpolymorph', disarm: '\\bdisarm|\\bcan(no|\')t attack\\b|\\bprevent(s)?[^.]{0,30}\\battack(ing)?\\b',
  slow: '\\bslow(s|ed|ing)?\\b', fear: '\\bfear|\\bterrif|\\bflee|\\brun(s)? away\\b', taunt: '\\btaunt|\\bforc(es|ing)[^.]{0,40}\\battack\\b',
  sleep: '\\bsleep|\\bput(s)?[^.]{0,20}to sleep', knockback: '\\bknock(s|ed|ing)?\\b|\\bdrag(s|ging)?\\b|\\bpull(s|ing)?\\b|\\bpush(es|ing)?\\b|\\bhurl|\\bdisplace|\\bforced movement|\\bcyclone|\\bsuck',
  blind: '\\bblind|\\bmiss chance|\\bchance to miss\\b', break: '\\bbreak(s)? passive|\\bpassive abilities?[^.]{0,30}(disabled|break)|\\bbreaks?\\b[^.]{0,20}\\bpassive',
  invis: '\\binvisib', heal: '\\bheals?\\b|\\bhealing\\b|\\blifesteal|\\blife steal', dispel: '\\bdispel|\\bpurge|\\bremoves? [^.]{0,30}(debuffs|buffs|negative)',
  barrier: '\\bbarrier|\\bshield|\\babsorbs?\\b|\\bblocks?\\b[^.]{0,20}\\bdamage', evasion: '\\bevasion|\\bdodge',
}
const RES = (Object.entries(STATUS_RE) as [Status, string][]).map(([k, v]) => [k, new RegExp(v, 'i')] as const)
export const classify = (text: string): Status[] => RES.filter(([, re]) => re.test(text)).map(([k]) => k)

/** Control effects that stop or hinder an enemy; weight = how much each is worth in a fight. */
export const CONTROL: Partial<Record<Status, number>> = { stun: 1, hex: 1, sleep: 0.9, fear: 0.8, taunt: 0.7, root: 0.6, silence: 0.5, disarm: 0.5, knockback: 0.4, slow: 0.3, blind: 0.3, break: 0.3, mute: 0.25 }
const HARD: Status[] = ['stun', 'hex', 'sleep', 'fear', 'taunt', 'root']

export type KitAbility = { n: string; u: boolean; p: boolean; d: 0 | 1 | 2 | 4; x: boolean; c: Status[]; m: number }
export type KitStats = {
  str: number; strg: number; agi: number; agig: number; int: number; intg: number; attr: number; hp: number; hpr: number; mana: number; manar: number
  dmin: number; dmax: number; bat: number; range: number; proj: number; armor: number; mr: number; ms: number; turn: number; sight: number; night: number; cx: number
}
export type Kit = { s: KitStats; r: number[]; a: KitAbility[] }
export type KitsDb = { builtAt: number; heroes: Record<number, Kit> }
export const ROLE_ORDER = ['Carry', 'Support', 'Nuker', 'Disabler', 'Jungler', 'Durable', 'Escape', 'Pusher', 'Initiator'] as const

// Attribute scaling used by the current game version. Change here if Valve rebalances; the ridge fit re-learns the weights.
export const RULES = { hpPerStr: 22, hpRegenPerStr: 0.1, manaPerInt: 12, armorPerAgi: 1 / 6, attackSpeedPerAgi: 1, damagePerPrimary: 1, universalDamage: 0.45, magicResistPerInt: 0.001, manaRegenPerInt: 0.05, level: 11 }
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** Physical damage reduction from armor (Dota 2 formula; negative armor amplifies). */
export const armorReduction = (armor: number) => 0.06 * armor / (1 + 0.06 * Math.abs(armor))

export type Snapshot = { hp: number; mana: number; armor: number; mr: number; aps: number; dmg: number; ms: number; range: number; str: number; agi: number; int: number; regen: number }
/** A hero's raw stats at a level with no items. HP/mana/armor/attack speed/damage all follow from the attributes. */
export function atLevel(kit: Kit, level = RULES.level): Snapshot {
  const s = kit.s, n = level - 1
  const str = s.str + s.strg * n, agi = s.agi + s.agig * n, int = s.int + s.intg * n
  const primary = s.attr === 0 ? str : s.attr === 1 ? agi : s.attr === 2 ? int : 0
  const primaryBase = s.attr === 0 ? s.str : s.attr === 1 ? s.agi : s.attr === 2 ? s.int : 0
  const universal = s.attr === 3 ? RULES.universalDamage * ((str + agi + int) - (s.str + s.agi + s.int)) : 0
  const dmg = (s.dmin + s.dmax) / 2 + (primary - primaryBase) * RULES.damagePerPrimary + universal
  return {
    hp: s.hp + RULES.hpPerStr * s.strg * n, mana: s.mana + RULES.manaPerInt * s.intg * n, armor: s.armor + RULES.armorPerAgi * s.agig * n, mr: s.mr / 100,
    aps: (1 + (agi * RULES.attackSpeedPerAgi) / 100) / s.bat, dmg, ms: s.ms, range: s.range, str, agi, int, regen: s.hpr + RULES.hpRegenPerStr * s.strg * n,
  }
}

const level = (kit: Kit, role: (typeof ROLE_ORDER)[number]) => kit.r[ROLE_ORDER.indexOf(role)] ?? 0
const count = (kit: Kit, st: Status) => kit.a.filter((a) => a.c.includes(st)).length

/** Weighted control a hero brings, ultimates count 1.4x. Roughly 0 (none) to 4 (a full control kit). */
export function controlScore(kit: Kit) {
  return kit.a.reduce((sum, a) => sum + a.c.reduce((s, c) => s + (CONTROL[c] ?? 0), 0) * (a.u ? 1.4 : 1), 0)
}
/** How much a hero's spells matter to it (silence hurts these heroes most), 0..1. */
export const spellDependence = (kit: Kit) => clamp((level(kit, 'Nuker') + 0.5 * level(kit, 'Disabler') + 0.3 * level(kit, 'Support') + 0.3 * level(kit, 'Initiator')) / 6, 0, 1)
/** How much a hero shrugs off control, 0..1: escapes and tanks are harder to lock down. */
const slipperiness = (kit: Kit) => clamp(0.45 * level(kit, 'Escape') / 3 + 0.2 * level(kit, 'Durable') / 3, 0, 0.65)

/** Share of a hero's damage that is physical / magical / pure: right-click weighs in by carry level, abilities by their damage type. */
export function damageMix(kit: Kit) {
  let phys = 1 + 1.5 * level(kit, 'Carry'), mag = 0, pure = 0
  for (const a of kit.a) { const w = a.u ? 1.5 : 1; if (a.d === 1) phys += w; else if (a.d === 2) mag += w; else if (a.d === 4) pure += w }
  const total = phys + mag + pure
  return { phys: phys / total, mag: mag / total, pure: pure / total }
}

export const FEATURES = ['duel', 'range', 'mobility', 'control', 'silence', 'disarm', 'mute', 'damage mix', 'spell-immunity piercing'] as const
export type FeatureName = (typeof FEATURES)[number]

/** Antisymmetric feature vector for hero C against hero E: positive favours C, and features(E, C) = -features(C, E). */
export function features(c: Kit, e: Kit): number[] {
  const a = atLevel(c), b = atLevel(e)
  const dps = (x: Snapshot, y: Snapshot) => x.dmg * x.aps * (1 - armorReduction(y.armor))
  // Lanchester-style duel: time to kill = HP / DPS, so who wins a 1v1 is the ratio of (HP x DPS) after armor.
  const duel = clamp(Math.log((a.hp * dps(a, b)) / (b.hp * dps(b, a))), -1.2, 1.2)
  const range = clamp((a.range - b.range) / 500, -1, 1)
  const mobility = clamp(Math.log(a.ms / b.ms) * 5, -1, 1)
  const control = (controlScore(c) * (1 - slipperiness(e)) - controlScore(e) * (1 - slipperiness(c))) / 4
  const silence = (Math.min(2, count(c, 'silence')) * spellDependence(e) - Math.min(2, count(e, 'silence')) * spellDependence(c)) / 2
  const disarm = (Math.min(1, count(c, 'disarm')) * level(e, 'Carry') / 3 - Math.min(1, count(e, 'disarm')) * level(c, 'Carry') / 3)
  const mute = (Math.min(1, count(c, 'mute')) * level(e, 'Escape') / 3 - Math.min(1, count(e, 'mute')) * level(c, 'Escape') / 3)
  const vuln = (mix: ReturnType<typeof damageMix>, def: Snapshot) => mix.phys * (1 - armorReduction(def.armor)) + mix.mag * (1 - def.mr) + mix.pure
  const mix = clamp(Math.log(vuln(damageMix(c), b) / vuln(damageMix(e), a)) * 2, -1, 1)
  const piercing = (k: Kit) => k.a.filter((x) => x.x && x.c.some((s) => HARD.includes(s))).length
  const pierce = clamp((piercing(c) - piercing(e)) / 2, -1, 1)
  return [duel, range, mobility, control, silence, disarm, mute, mix, pierce]
}

export const FEATURE_LABELS: Record<FeatureName, string> = {
  duel: '1v1 strength (health x damage after armor)', range: 'Attack range', mobility: 'Move speed', control: 'Disables you land vs take', silence: 'Silence vs how spell-reliant they are',
  disarm: 'Disarm vs right-click carries', mute: 'Mute vs item escapes', 'damage mix': 'Damage type vs their armor and magic resist', 'spell-immunity piercing': 'Disables that pierce BKB',
}

/** Minimum points per unit of each mechanic. Data can raise these; it cannot push them below. */
export const WEIGHT_FLOOR: Partial<Record<FeatureName, number>> = { control: 0.4, silence: 0.3, disarm: 0.3, 'spell-immunity piercing': 0.2, mobility: 0.2, mute: 0.1 }

export type MechModel = {
  beta: number[]; r2: number; samples: number
  /** Prior strength in pseudo-games, estimated from how spread out real pair results are beyond coin-flip noise (empirical Bayes). */
  k: number
  importance: { name: FeatureName; weight: number; share: number }[]
  predict(c: number, e: number): { edge: number; parts: { label: FeatureName; points: number }[] }
}

/** Weighted ridge regression, solved in closed form (Gaussian elimination on the normal equations). */
function ridge(X: number[][], y: number[], w: number[], lambda: number) {
  const k = X[0].length
  const A = Array.from({ length: k }, () => new Array<number>(k).fill(0)), b = new Array<number>(k).fill(0)
  const W = w.reduce((s, v) => s + v, 0)
  X.forEach((row, n) => { for (let i = 0; i < k; i++) { b[i] += w[n] * row[i] * y[n] / W; for (let j = 0; j < k; j++) A[i][j] += w[n] * row[i] * row[j] / W } })
  for (let i = 0; i < k; i++) A[i][i] += lambda
  for (let i = 0; i < k; i++) { // forward elimination with partial pivoting
    let p = i; for (let r = i + 1; r < k; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r
    ;[A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]]
    for (let r = i + 1; r < k; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c < k; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i] }
  }
  const beta = new Array<number>(k).fill(0)
  for (let i = k - 1; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < k; j++) s -= A[i][j] * beta[j]; beta[i] = s / A[i][i] }
  return beta
}

/**
 * Learn how much each mechanic matters from real hero-vs-hero results. Target = how far a pair's win rate sits from what the
 * two heroes' overall strengths predict (so raw hero power is removed), weighted by games. Returns a predictor usable even
 * for pairs with little or no data (new heroes, fresh patches).
 */
export function buildMech(kits: KitsDb | null, seed: Seed | null, base: Record<number, number>, minGames = 40): MechModel | null {
  if (!kits || !seed) return null
  const heroes = kits.heroes
  const cache = new Map<string, number[]>()
  const feat = (c: number, e: number) => {
    const key = c + ':' + e
    let f = cache.get(key)
    if (!f && heroes[c] && heroes[e]) { f = features(heroes[c], heroes[e]); cache.set(key, f) }
    return f
  }
  const X: number[][] = [], y: number[] = [], w: number[] = []
  for (const [cid, rows] of Object.entries(seed.matchups)) {
    const c = Number(cid)
    for (const [e, g, wins] of rows) {
      if (g < minGames || c >= e) continue // each unordered pair once (features are antisymmetric)
      const f = feat(c, e)
      if (!f) continue
      const expected = clamp(0.5 + (base[c] ?? 0.5) - (base[e] ?? 0.5), 0.35, 0.65)
      X.push(f); y.push((wins / g - expected) * 100); w.push(g)
    }
  }
  if (X.length < 200) return null
  // A mechanic can only help the side that has it, so weights are constrained to be non-negative: fit, drop anything that came out
  // negative (noise or confounding, not a real penalty), refit. Dropped features simply carry no measurable effect in the data.
  // Features are standardised before fitting so the ridge penalty is the same for every mechanic regardless of its natural scale.
  const Wsum = w.reduce((t, v) => t + v, 0)
  const spread = FEATURES.map((_, j) => Math.sqrt(X.reduce((t, r, i) => t + w[i] * r[j] ** 2, 0) / Wsum) || 1)
  const Z = X.map((r) => r.map((v, j) => v / spread[j]))
  let active = FEATURES.map((_, j) => j)
  let beta: number[] = new Array(FEATURES.length).fill(0)
  for (let pass = 0; pass < FEATURES.length && active.length; pass++) {
    const fitted = ridge(Z.map((r) => active.map((j) => r[j])), y, w, 0.02)
    beta = new Array(FEATURES.length).fill(0)
    active.forEach((j, i) => { beta[j] = fitted[i] / spread[j] })
    const keep = active.filter((j) => beta[j] >= 0)
    if (keep.length === active.length) break
    active = keep
  }
  // Where public data is silent (small samples), keep a modest game-knowledge floor so real mechanics are never ignored entirely.
  FEATURES.forEach((name, j) => { beta[j] = Math.max(beta[j], WEIGHT_FLOOR[name] ?? 0) })
  const W = w.reduce((s, v) => s + v, 0)
  // How big are TRUE matchup effects? Observed spread of (rate - expected) minus the spread coin-flip noise alone would give.
  const resid = y.map((v, i) => v / 100), noise = w.map((g) => 0.25 / g)
  const var0 = resid.reduce((s, v, i) => s + v * v, 0) / resid.length
  const tau2 = Math.max(0.0004, var0 - noise.reduce((s, v) => s + v, 0) / noise.length) // at least a 2-point standard deviation
  const k = clamp(0.25 / tau2, 80, 900)
  const mean = y.reduce((s, v, i) => s + v * w[i], 0) / W
  let ssRes = 0, ssTot = 0
  X.forEach((row, i) => { const p = row.reduce((s, v, j) => s + v * beta[j], 0); ssRes += w[i] * (y[i] - p) ** 2; ssTot += w[i] * (y[i] - mean) ** 2 })
  const std = FEATURES.map((_, j) => Math.sqrt(X.reduce((s, r, i) => s + w[i] * r[j] ** 2, 0) / W))
  const imp = FEATURES.map((name, j) => ({ name, weight: beta[j], raw: Math.abs(beta[j]) * std[j] }))
  const total = imp.reduce((s, v) => s + v.raw, 0) || 1
  return {
    beta, k, r2: ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0, samples: X.length,
    importance: imp.map(({ name, weight, raw }) => ({ name, weight, share: raw / total })).sort((a, b) => b.share - a.share),
    predict(c, e) {
      const f = feat(c, e)
      if (!f) return { edge: 0, parts: [] }
      const parts = FEATURES.map((label, j) => ({ label, points: beta[j] * f[j] }))
      return { edge: clamp(parts.reduce((s, p) => s + p.points, 0), -6, 6), parts: parts.filter((p) => Math.abs(p.points) >= 0.05).sort((a, b) => Math.abs(b.points) - Math.abs(a.points)) }
    },
  }
}

// ---- Lineup analysis and fixes ---------------------------------------------------------------------------------------
export type TeamProfile = {
  heroes: number; damage: { phys: number; mag: number; pure: number }; control: Partial<Record<Status, number>>; hard: number; piercing: number
  stealth: number; sustain: number; evasion: number; avgArmor: number; avgMr: number; escape: number; durable: number; carry: number; support: number
}

export function teamProfile(ids: number[], kits: KitsDb | null): TeamProfile | null {
  const list = ids.flatMap((id) => kits?.heroes[id] ?? [])
  if (!list.length) return null
  const mixes = list.map(damageMix), snaps = list.map((k) => atLevel(k))
  const avg = (f: (i: number) => number) => list.reduce((s, _, i) => s + f(i), 0) / list.length
  const control: Partial<Record<Status, number>> = {}
  for (const k of list) for (const st of Object.keys(CONTROL) as Status[]) { const n = count(k, st); if (n) control[st] = (control[st] ?? 0) + n }
  const sum = (r: (typeof ROLE_ORDER)[number]) => list.reduce((s, k) => s + level(k, r), 0)
  return {
    heroes: list.length, damage: { phys: avg((i) => mixes[i].phys), mag: avg((i) => mixes[i].mag), pure: avg((i) => mixes[i].pure) }, control,
    hard: HARD.reduce((s, st) => s + (control[st] ?? 0), 0), piercing: list.reduce((s, k) => s + k.a.filter((a) => a.x && a.c.some((c) => HARD.includes(c))).length, 0),
    stealth: list.filter((k) => count(k, 'invis') > 0).length, sustain: list.filter((k) => count(k, 'heal') + count(k, 'barrier') > 0).length, evasion: list.filter((k) => count(k, 'evasion') > 0).length,
    avgArmor: avg((i) => snaps[i].armor), avgMr: avg((i) => snaps[i].mr), escape: sum('Escape'), durable: sum('Durable'), carry: sum('Carry'), support: sum('Support'),
  }
}

export type Fix = { id: string; severity: number; title: string; detail: string; items: string[] }

/** What to change against this lineup, derived from its computed profile. Higher severity first. */
export function rectify(enemy: TeamProfile | null, ally: TeamProfile | null = null): Fix[] {
  const fixes: Fix[] = []
  const pct = (x: number) => Math.round(x * 100) + '%'
  if (enemy) {
    const e = enemy
    if (e.damage.mag >= 0.4) fixes.push({ id: 'magic', severity: e.damage.mag, title: `Magic-heavy lineup (${pct(e.damage.mag)} of damage)`, detail: 'Armor does nothing against it. Stack magic resistance or block it outright.', items: ['hood_of_defiance', 'pipe', 'glimmer_cape', 'black_king_bar'] })
    if (e.damage.phys >= 0.55) fixes.push({ id: 'physical', severity: e.damage.phys, title: `Physical-heavy lineup (${pct(e.damage.phys)} of damage)`, detail: 'Armor and evasion are strong: they cut right-click damage directly.', items: ['ghost', 'heavens_halberd', 'shivas_guard', 'crimson_guard'] })
    if (e.hard >= 4) fixes.push({ id: 'disables', severity: Math.min(1, e.hard / 7), title: `${e.hard} hard disables (stun, hex, root, fear, taunt, sleep)`, detail: 'Being locked down is how you lose fights. Time spell immunity or a spell block before they initiate.', items: ['black_king_bar', 'sphere', 'lotus_orb', 'cyclone'] })
    if (e.piercing >= 2) fixes.push({ id: 'pierce', severity: Math.min(1, e.piercing / 4), title: `${e.piercing} of their disables pierce spell immunity`, detail: 'Black King Bar will not stop them. Use Linken\'s, Lotus or positioning, and kill the initiator first.', items: ['sphere', 'lotus_orb', 'cyclone'] })
    if ((e.control.silence ?? 0) >= 2) fixes.push({ id: 'silence', severity: 0.6, title: `${e.control.silence} silences`, detail: 'Spell-reliant heroes are shut down. Keep a dispel (Manta, Lotus, Eul) ready.', items: ['manta', 'lotus_orb', 'cyclone'] })
    if ((e.control.disarm ?? 0) >= 1) fixes.push({ id: 'disarm', severity: 0.45, title: 'Disarm on their side', detail: 'Right-click carries are neutralised. Dispels and Eul break it.', items: ['manta', 'cyclone'] })
    if ((e.control.slow ?? 0) >= 3) fixes.push({ id: 'slows', severity: 0.4, title: `${e.control.slow} slows`, detail: 'You will be kited. Movement items and dispels help.', items: ['manta', 'force_staff', 'yasha'] })
    if (e.stealth >= 1) fixes.push({ id: 'stealth', severity: 0.7, title: `${e.stealth} stealth hero${e.stealth > 1 ? 'es' : ''}`, detail: 'Carry detection before they can pick you off.', items: ['dust', 'ward_sentry', 'gem'] })
    if (e.sustain >= 2) fixes.push({ id: 'sustain', severity: 0.45, title: 'Healing and barriers on their side', detail: 'Cut sustain so burst can finish targets.', items: ['spirit_vessel', 'shivas_guard'] })
    if (e.evasion >= 1) fixes.push({ id: 'evasion', severity: 0.5, title: 'Evasion or dodge', detail: 'Normal attacks will miss. True strike beats it.', items: ['monkey_king_bar', 'bloodthorn'] })
    if (e.escape >= 7) fixes.push({ id: 'escape', severity: 0.5, title: 'Slippery lineup', detail: 'They disengage easily. Lock targets down before committing.', items: ['orchid', 'gungir', 'sheepstick'] })
  }
  if (ally) {
    const a = ally
    if (a.heroes >= 3 && a.hard < 3) fixes.push({ id: 'lowcontrol', severity: 0.55, title: 'Your team lacks reliable disables', detail: 'Add a stun, hex or root so your damage can land.', items: ['sheepstick', 'orchid'] })
    if (a.heroes >= 3 && a.damage.mag < 0.12) fixes.push({ id: 'nomagic', severity: 0.45, title: 'Almost no magic damage', detail: 'Against armor and Ghost Scepter you need a magic source.', items: ['kaya', 'shivas_guard'] })
    if (a.heroes >= 3 && a.damage.phys < 0.3) fixes.push({ id: 'nophys', severity: 0.4, title: 'Low physical damage', detail: 'Against high magic resistance you need right-click damage.', items: ['desolator'] })
    if (a.heroes >= 4 && a.carry < 2) fixes.push({ id: 'nocarry', severity: 0.6, title: 'No late-game scaling', detail: 'Plan to win before minute 30, or pick a carry.', items: [] })
  }
  return fixes.sort((x, y) => y.severity - x.severity).slice(0, 6)
}

// ---- Teaching: what the stats and effects mean ------------------------------------------------------------------------
export const GLOSSARY: { group: string; term: string; short: string; detail: string }[] = [
  { group: 'Attributes', term: 'Strength', short: 'Health and regeneration', detail: 'Each point gives 22 health and 0.1 health regeneration. Strength heroes are durable. Strength is the damage attribute for Strength heroes.' },
  { group: 'Attributes', term: 'Agility', short: 'Attack speed and armor', detail: 'Each point gives 1 attack speed and about 1/6 armor. Agility is the damage attribute for Agility heroes.' },
  { group: 'Attributes', term: 'Intelligence', short: 'Mana and spell power', detail: 'Each point gives 12 mana and some mana regeneration. Intelligence heroes cast more spells and trade mana for damage.' },
  { group: 'Attributes', term: 'Universal', short: 'A bit of everything', detail: 'Universal heroes get 0.45 damage per attribute point from all three attributes, so they scale evenly.' },
  { group: 'Defence', term: 'Armor', short: 'Cuts physical damage', detail: 'Reduction = 0.06 x armor / (1 + 0.06 x |armor|). 10 armor blocks about 37%. It does not affect magical or pure damage.' },
  { group: 'Defence', term: 'Magic resistance', short: 'Cuts magical damage', detail: 'Most heroes start at 25%. It reduces magical damage only. Black King Bar blocks most magic entirely.' },
  { group: 'Defence', term: 'Evasion', short: 'Dodge right-clicks', detail: 'A percentage chance for physical attacks to miss. True strike (Monkey King Bar, Bloodthorn) ignores it.' },
  { group: 'Damage', term: 'Physical', short: 'Reduced by armor', detail: 'Normal attacks and many abilities. Armor and evasion are the counters.' },
  { group: 'Damage', term: 'Magical', short: 'Reduced by magic resistance', detail: 'Most spells. Ignores armor, so it beats high-armor heroes.' },
  { group: 'Damage', term: 'Pure', short: 'Cannot be reduced', detail: 'Ignores armor and magic resistance, the hardest damage to prevent.' },
  { group: 'Control', term: 'Stun', short: 'Cannot move, attack or cast', detail: 'The strongest disable. Basic dispels do not remove it; Black King Bar and spell block can prevent it.' },
  { group: 'Control', term: 'Silence', short: 'Cannot cast spells', detail: 'Shuts down spell-reliant heroes (nukers, supports). Items and attacks still work. Dispels remove it.' },
  { group: 'Control', term: 'Mute', short: 'Cannot use items', detail: 'Blocks escape items like Blink and Force Staff. Spells and attacks still work.' },
  { group: 'Control', term: 'Root', short: 'Cannot move', detail: 'You can still attack and cast. Blink and many escapes still work depending on the root.' },
  { group: 'Control', term: 'Disarm', short: 'Cannot right-click', detail: 'Stops normal attacks. It neutralises carries but not spells.' },
  { group: 'Control', term: 'Hex', short: 'Turned into a harmless creature', detail: 'Cannot attack or cast and is slowed. Works like a stun that also removes your abilities.' },
  { group: 'Control', term: 'Fear / Taunt', short: 'Forced behaviour', detail: 'Fear makes you flee; taunt forces you to attack the taunter. You cannot choose your actions.' },
  { group: 'Control', term: 'Sleep', short: 'Disabled until damaged', detail: 'Cannot act until woken by damage or time.' },
  { group: 'Control', term: 'Slow', short: 'Reduced move speed', detail: 'Makes you easy to catch and kite. Basic dispels remove it.' },
  { group: 'Control', term: 'Break', short: 'Passive abilities disabled', detail: 'Turns off passive abilities and item effects for its duration.' },
  { group: 'Immunity', term: 'Spell immunity (BKB)', short: 'Blocks most spells', detail: 'Black King Bar blocks almost all spells and debuffs. Some abilities pierce it (marked in the kit); plan around those.' },
  { group: 'Immunity', term: 'Dispel', short: 'Removes effects', detail: 'Basic dispels remove many buffs and slows; strong dispels also remove stuns and other hard effects.' },
]
