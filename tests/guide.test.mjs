import assert from 'node:assert/strict'
import test from 'node:test'
import { counterTips, guideTips, laneAdvice, matchupRows, stripTags } from '../dist/main/shared/guide.js'
import { featuredHero } from '../dist/main/shared/analysis.js'

const hero = (id, slug, roles) => ({ id, slug, name: slug, roles })
const heroes = [hero(1, 'riki', ['Escape', 'Disabler']), hero(2, 'phantom_assassin', ['Carry', 'Escape']), hero(3, 'lina', ['Nuker', 'Disabler']), hero(4, 'zeus', ['Nuker']), hero(5, 'necrolyte', ['Nuker'])]

test('featured hero is the most played in the last 30, ties broken by win rate', () => {
  const m = (heroId, won, i) => ({ id: String(i), heroId, won, start: 1e9 - i, duration: 1800, kills: 5, deaths: 5, assists: 5, lastHits: 180, denies: 10, gpm: 500, xpm: 600 })
  const rows = [...Array(6).fill(0).map((_, i) => m(44, i < 4, i)), ...Array(6).fill(0).map((_, i) => m(8, i < 5, 10 + i)), ...Array(10).fill(0).map((_, i) => m(2, true, 100 + i))]
  const f = featuredHero(rows.slice(0, 12), 30)
  assert.equal(f.heroId, 8) // 6 vs 6 games: Juggernaut-like id 8 wins more
  assert.equal(f.games, 6)
  assert.equal(Math.round(f.lhpm), 6) // 180 LH / 30 min
  assert.equal(featuredHero([], 30), null)
  assert.equal(featuredHero(rows, 12).of, 12) // window respected
})

test('counter tips use stealth, evasion, sustain and role tags, and need 2+ enemies', () => {
  assert.deepEqual(counterTips([1], heroes), [])
  const text = counterTips([1, 2, 3, 5], heroes).map((t) => t.text).join(' | ')
  assert.match(text, /Stealth threat \(riki\)/)
  assert.match(text, /Evasion \(phantom_assassin\)/)
  assert.match(text, /Spirit Vessel/)
  assert.ok(counterTips([1, 2, 3, 4, 5], heroes).length <= 4)
  assert.match(counterTips([3, 4], heroes).map((t) => t.text).join(), /nukers/)
})

test('lane advice respects bad matchups and presses good ones', () => {
  const index = new Map([[10, new Map([[1, [1000, 400]], [2, [1000, 650]]])]])
  const rows = matchupRows(10, [1, 2, 2], index)
  assert.equal(rows.length, 2)
  assert.ok(rows[0].rate < rows[1].rate)
  const tips = laneAdvice(rows, (id) => 'H' + id).map((t) => t.text).join(' ')
  assert.match(tips, /Respect H1/)
  assert.match(tips, /Pressure H2/)
})

test('guide tips cover lane, game length, build path and range', () => {
  const guide = { id: 1, patches: [], info: { hype: '', bio: '', primary: 'Agility', complexity: 3, attackRange: 600, moveSpeed: 300, armor: 2, health: 600, mana: 300, damage: [50, 55], attackRate: 1.7, sightDay: 1800, sightNight: 800, magicResist: 25, abilities: [] },
    lanes: [{ lane: 'Safe', games: 800, wins: 420 }, { lane: 'Mid', games: 300, wins: 190 }],
    durations: [{ minute: 20, games: 400, wins: 160 }, { minute: 35, games: 500, wins: 300 }, { minute: 50, games: 200, wins: 110 }] }
  const data = { items: { starting: [], early: [['power_treads', 5]], mid: [['bfury', 5], ['black_king_bar', 4]], late: [] } }
  const out = guideTips(guide, data, undefined, (k) => k).join(' | ')
  assert.match(out, /Most played from the safe lane \(73% of games, 53% wins\)/)
  assert.match(out, /Wins more from the mid lane \(63%\)/)
  assert.match(out, /Strongest in games 30 to 45 min \(60% wins\)/)
  assert.match(out, /Popular core path: power_treads then bfury, black_king_bar/)
  assert.match(out, /Ranged \(600\)/)
  assert.match(out, /High complexity/)
})

test('markup in Valve text is stripped', () => {
  assert.equal(stripTags('One after another, <b>locks</b>   his <i>foes</i>.'), 'One after another, locks his foes.')
  assert.equal(stripTags(undefined), '')
})
