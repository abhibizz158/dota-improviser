import assert from 'node:assert/strict'
import test from 'node:test'
import { FEATURES, GLOSSARY, STATUS_RE, armorReduction, atLevel, buildMech, classify, features, rectify, teamProfile } from '../src/shared/mechanics.ts'

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`)
const stats = (o = {}) => ({ str: 20, strg: 2.5, agi: 20, agig: 2, int: 18, intg: 1.8, attr: 0, hp: 600, hpr: 2, mana: 300, manar: 1, dmin: 50, dmax: 56, bat: 1.7, range: 150, proj: 0, armor: 2, mr: 25, ms: 310, turn: .6, sight: 1800, night: 800, cx: 1, ...o })
const kit = (s = {}, r = [0, 0, 0, 0, 0, 0, 0, 0, 0], a = []) => ({ s: stats(s), r, a })
const ab = (c = [], o = {}) => ({ n: 'x', u: false, p: false, d: 0, x: false, c, m: 0, ...o })

test('ability text is tagged with the effects it describes', () => {
  assert.deepEqual(classify('Summons a column of flames that damages and stuns enemies.'), ['stun'])
  assert.ok(classify('Silencer stops all sound, preventing enemy heroes from casting spells.').includes('silence'))
  assert.ok(classify('Axe taunts nearby enemy units, forcing them to attack him').includes('taunt'))
  assert.ok(classify('Enemies are slowed by 30% and disarmed.').includes('slow') && classify('disarmed').includes('disarm'))
  assert.ok(classify('Hexes the target into a frog').includes('hex'))
  assert.deepEqual(classify('Provides vision of the target area.'), [])
  assert.equal(classify('Restores mana over time.').includes('heal'), false) // mana is not healing
  assert.equal(Object.keys(STATUS_RE).length, 18)
})

test('armor reduction follows the Dota formula, including negative armor', () => {
  close(armorReduction(0), 0)
  close(armorReduction(10), 0.375)
  close(armorReduction(-10), -0.375)
  assert.ok(armorReduction(100) < 0.86 && armorReduction(100) > 0.85)
})

test('attributes scale health, mana, armor, attack speed and damage', () => {
  const k = kit({ attr: 1, agi: 20, agig: 3 }) // agility hero
  const l1 = atLevel(k, 1), l11 = atLevel(k, 11)
  close(l1.hp, 600); close(l11.hp, 600 + 22 * 2.5 * 10)
  close(l11.mana, 300 + 12 * 1.8 * 10)
  close(l11.armor, 2 + (3 * 10) / 6)
  close(l11.aps, (1 + (20 + 30) / 100) / 1.7)
  close(l11.dmg, 53 + 30) // +1 damage per agility for an agility hero
  const uni = atLevel(kit({ attr: 3 }), 11) // universal: 0.45 per point across all three
  close(uni.dmg, 53 + 0.45 * (25 + 20 + 18))
})

test('features are antisymmetric: what favours A over B disfavours B over A', () => {
  const a = kit({ range: 600, ms: 300, hp: 560 }, [0, 0, 3, 3, 0, 0, 1, 0, 0], [ab(['stun', 'silence'], { x: true, d: 2, u: true }), ab(['slow'], { d: 2 })])
  const b = kit({ range: 150, ms: 325, hp: 700, armor: 4 }, [3, 0, 0, 0, 0, 2, 0, 0, 1], [ab(['disarm', 'mute'], { d: 1 }), ab([], { d: 4 })])
  const f = features(a, b), g = features(b, a)
  assert.equal(f.length, FEATURES.length)
  f.forEach((v, i) => close(v, -g[i], 1e-9))
  assert.ok(f[1] > 0) // longer range favours a
})

// Synthetic world where win rate beyond hero strength = 3 points per unit of duel strength, nothing else matters.
function world(effect) {
  let seed = 11
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const heroes = {}
  for (let id = 1; id <= 40; id++) heroes[id] = kit({ hp: 500 + rnd() * 300, dmin: 45 + rnd() * 25, dmax: 55 + rnd() * 25, armor: rnd() * 6, range: rnd() < .4 ? 600 : 150, ms: 290 + rnd() * 50, bat: 1.4 + rnd() * .4 }, [rnd() * 3 | 0, 0, 0, 0, 0, 0, 0, 0, 0], [])
  const matchups = {}
  for (let c = 1; c <= 40; c++) matchups[c] = []
  for (let c = 1; c <= 40; c++) for (let e = 1; e <= 40; e++) {
    if (c === e) continue
    const f = features(heroes[c], heroes[e])
    const g = 3000, rate = Math.min(0.7, Math.max(0.3, 0.5 + effect(f) / 100))
    matchups[c].push([e, g, Math.round(g * rate)])
  }
  return { kits: { builtAt: 1, heroes }, seed: { patch: '7', builtAt: 1, matchups }, base: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [i + 1, 0.5])) }
}

test('ridge fit recovers a planted mechanic and ignores the rest', () => {
  const w = world((f) => 3 * f[0])
  const m = buildMech(w.kits, w.seed, w.base)
  assert.ok(m.r2 > 0.5, 'r2 ' + m.r2) // floors on control/silence cost a little fit in a world where those do not matter
  assert.ok(Math.abs(m.beta[0] - 3) < 0.3, 'duel beta ' + m.beta[0])
  assert.equal(m.importance[0].name, 'duel')
  assert.ok(m.samples >= 700)
  const p = m.predict(1, 2)
  assert.ok(Math.abs(p.edge - 3 * features(w.kits.heroes[1], w.kits.heroes[2])[0]) < 1.1)
  assert.ok(m.k >= 80 && m.k <= 900)
})

test('negative effects are constrained away; control keeps a game-knowledge floor', () => {
  const w = world((f) => -2 * f[1]) // longer range HURTS in this fake world
  const m = buildMech(w.kits, w.seed, w.base)
  assert.equal(m.beta[1], 0)
  assert.ok(m.beta[3] >= 0.4) // control floor
  assert.equal(buildMech(null, w.seed, w.base), null)
  assert.equal(buildMech(w.kits, { ...w.seed, matchups: { 1: [[2, 100, 50]] } }, w.base), null) // too little data
})

test('lineup profile and fixes: magic-heavy, disables, silences, stealth, piercing', () => {
  const caster = (extra = []) => kit({}, [0, 0, 3, 2, 0, 0, 0, 0, 0], [ab(['stun'], { d: 2, x: true, u: true }), ab(['silence'], { d: 2 }), ...extra])
  const enemy = teamProfile([1, 2, 3, 4, 5], { builtAt: 1, heroes: { 1: caster(), 2: caster([ab(['invis'])]), 3: caster(), 4: caster([ab(['root'])]), 5: caster([ab(['hex'])]) } })
  assert.ok(enemy.damage.mag > 0.5)
  const ids = rectify(enemy, null).map((f) => f.id)
  for (const want of ['magic', 'disables', 'silence', 'stealth', 'pierce']) assert.ok(ids.includes(want), want + ' in ' + ids)
  assert.ok(rectify(enemy, null)[0].severity >= rectify(enemy, null).at(-1).severity)
  assert.ok(rectify(enemy, null).find((f) => f.id === 'magic').items.includes('black_king_bar'))
  const weakAlly = teamProfile([1], { builtAt: 1, heroes: { 1: kit({}, [3, 0, 0, 0, 0, 0, 0, 0, 0], []) } })
  assert.equal(teamProfile([], null), null)
  assert.ok(Array.isArray(rectify(null, weakAlly)))
})

test('the mechanics guide covers attributes, defences, damage types and control', () => {
  const groups = new Set(GLOSSARY.map((g) => g.group))
  for (const g of ['Attributes', 'Defence', 'Damage', 'Control', 'Immunity']) assert.ok(groups.has(g), g)
  for (const t of ['Strength', 'Agility', 'Intelligence', 'Armor', 'Magic resistance', 'Silence', 'Mute', 'Stun']) assert.ok(GLOSSARY.some((g) => g.term === t), t)
})
