import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { itemInfo } from '../dist/main/main/data.js'
import { buildCurve, gearAt, learnItems } from '../dist/main/shared/items.js'

const { heroes } = JSON.parse(readFileSync('data/kits.json', 'utf8'))
const axe = heroes[2]
const pa = heroes[44]
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.001, actual + ' versus ' + expected)

test('hero-specific item stats include attribute conversions and selected Power Treads mode', () => {
  const base = gearAt(axe, 15, [])
  const treads = itemInfo.power_treads
  const str = gearAt(axe, 15, [treads], 'Strength')
  const agi = gearAt(axe, 15, [treads], 'Agility')
  const int = gearAt(axe, 15, [treads], 'Intelligence')
  assert.equal(str.hp - base.hp, 220)
  assert.equal(str.dmg - base.dmg, 10)
  close(agi.armor - base.armor, 10 / 6)
  assert.ok(agi.aps > str.aps)
  assert.equal(int.mana - base.mana, 120)
  assert.ok(int.mr > base.mr)
  assert.equal(gearAt(axe, 15, [treads, itemInfo.boots]).ms, str.ms)
  close(gearAt(pa, 15, [itemInfo.heart]).hp - gearAt(pa, 15, []).hp, 880)
  assert.match(itemInfo.black_king_bar.attributes.find((row) => row.key === 'duration').value, /9.*8.*7/)
})

test('build projections preserve order and item identity when optional entries are missing', () => {
  const path = ['power_treads', 'absent', 'heart']
  const result = buildCurve(axe, path, itemInfo, 500, 500)
  assert.deepEqual(result.buys.map(({ key }) => key), ['power_treads', 'heart'])
  assert.equal(result.points[0].owned, 0)
  assert.equal(result.points[20].owned, 2)
  assert.ok(result.points[20].hp > gearAt(axe, result.points[20].level, []).hp)
  assert.ok(result.buys[1].t > result.buys[0].t)
})

test('habit learning compares observed purchases and excludes short games from the without group', () => {
  const row = (id, options = {}) => ({ id, parsed: true, start: Number(id), players: [{
    accountId: '42', heroId: 44, mode: 'Ranked All Pick', won: true, duration: 1800, gpm: 500, xpm: 600,
    purchasesAvailable: true, events: [], ...options,
  }] })
  const buy = (time) => ({ kind: 'item', key: 'heart', label: 'Heart of Tarrasque', time })
  const learned = learnItems([
    row('1', { events: [buy(900), buy(1300)] }),
    row('2', { events: [buy(800)], won: false }),
    row('3', { events: [buy(1000)] }),
    row('4', { duration: 500, won: false }),
    row('5', { purchasesAvailable: false, won: false }),
    row('6', { mode: 'Turbo', events: [buy(600)] }),
    row('7', { won: false }),
    row('8', { accountId: '123', events: [buy(700)] }),
  ], '42', 44, { info: itemInfo, keyOf: () => undefined, popular: [] })
  assert.equal(learned.games, 5)
  assert.deepEqual(learned.usual, ['heart'])
  assert.equal(learned.habits[0].avgTime, 900)
  assert.equal(learned.habits[0].nWithout, 1)
  assert.equal(learned.habits[0].winWithout, 0)
  assert.deepEqual(learned.habits[0].history.map((entry) => entry.id), ['1', '2', '3'])
  assert.match(learned.advice[0].text, /3 of 5/)
})
