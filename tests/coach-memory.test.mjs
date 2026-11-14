import assert from 'node:assert/strict'
import test from 'node:test'
import { knownThreat } from '../dist/main/shared/contextual-coach.js'
import { recoveryAdvice } from '../dist/main/shared/live-coach.js'
import { deathScenarioKey, findCoachAnswer, recordDeathCase, saveCoachAnswer, scenarioKey } from '../dist/main/shared/coach-memory.js'

const frame = { clock: 250, matchmaking: true, alive: false, gold: 500, gpm: 310, xpm: 355, kills: 0, deaths: 1,
  assists: 1, lastHits: 12, level: 5, items: ['boots', 'black_king_bar'], respawnSeconds: 12 }
const scenario = { patch: '7.41', frame, hero: 13, role: 'Mid', mode: 'Ranked', phase: 'Laning', allies: [22, 7], enemies: [2, 3],
  killer: null, plan: ['blink'] }

test('respawn advice starts in lane, prioritizes a confirmed enemy and clears on respawn', () => {
  const enemies = [
    { hero: { id: 2, name: 'Axe' }, kit: { a: [{ n: 'Berserker’s Call', x: true, p: false, c: ['taunt'] }] } },
    { hero: { id: 3, name: 'Bane' }, kit: { a: [{ n: 'Nightmare', x: false, p: false, c: ['sleep'] }] } },
  ]
  const inferred = knownThreat(enemies, [{ enemy: 3, games: 300, rate: 44 }])
  const confirmed = knownThreat(enemies, [{ enemy: 3, games: 300, rate: 44 }], 2)
  assert.equal(inferred.confirmed, false)
  assert.equal(confirmed.confirmed, true)
  const advice = recoveryAdvice(frame, 'Mid', { phase: 'Laning' }, { threat: confirmed, priorCases: 2 })
  assert.equal(advice.threat, 'Killer you confirmed · Axe')
  assert.equal(advice.repeats, 2)
  assert.match(advice.tip, /Debuff immunity alone won’t stop it/)
  assert.equal(advice.followUp, undefined)
  assert.match(recoveryAdvice(frame, 'Mid', null, { threat: inferred }).followUp, /Black King Bar/)
  assert.equal(recoveryAdvice({ ...frame, alive: true }, 'Mid', null), null)
  assert.equal(recoveryAdvice({ ...frame, respawnSeconds: 0 }, 'Mid', null), null)
})

test('answer memory normalizes lineup order and invalidates after item, killer, patch or phase changes', () => {
  const key = scenarioKey(scenario)
  assert.equal(scenarioKey({ ...scenario, allies: [7, 22] }), key)
  for (const edit of [{ killer: 2 }, { phase: 'Mid game' }, { patch: '7.42' },
    { frame: { ...frame, items: ['boots', 'force_staff'] } }, { frame: { ...frame, alive: true } }]) {
    assert.notEqual(scenarioKey({ ...scenario, ...edit }), key)
  }
  const records = saveCoachAnswer([], { key, answer: 'Stay near allied vision.', at: 0 })
  assert.equal(findCoachAnswer(records, key, 1000), 'Stay near allied vision.')
  assert.equal(findCoachAnswer(records, key, 30 * 86400000), undefined)
})

test('repeated death scenarios group related deaths within a phase', () => {
  const key = deathScenarioKey(scenario)
  assert.equal(deathScenarioKey({ ...scenario, frame: { ...frame, deaths: 2, clock: 430, gold: 700 } }), key)
  assert.notEqual(deathScenarioKey({ ...scenario, killer: 2 }), key)
  const first = recordDeathCase([], key, 100)
  const second = recordDeathCase(first, key, 200)
  assert.deepEqual(second, [{ key, at: 200, times: 2 }])
})
