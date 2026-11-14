import assert from 'node:assert/strict'
import test from 'node:test'
import { contextualCoach } from '../dist/main/shared/contextual-coach.js'

const fixture = {
  frame: { clock: 500, deaths: 0, level: 7, gold: 2400, items: [] },
  role: 'Mid', mode: 'Ranked', bracket: 'Archon', baseline: { phase: 'Laning', lhPct: 55 },
  kit: { a: [{ n: 'Hex', p: false, c: ['hex'] }, { n: 'Finger of Death', p: false, u: true, c: [] }] },
  opponents: [{ hero: { id: 2, name: 'Axe' }, kit: { a: [{ n: 'Berserker’s Call', p: false, c: ['taunt', 'stun'] }] } }],
  rows: [{ enemy: 2, rate: 43.1, games: 700 }], data: { pick: [0, 0, 0, 300], win: [0, 0, 0, 159] },
  plan: [{ key: 'blink', name: 'Blink Dagger', cost: 2250 }], seen: {},
}

test('ranked lane advice distinguishes known matchup and bracket samples', () => {
  const result = contextualCoach(fixture)
  assert.equal(result.phase, 'Laning')
  assert.deepEqual(result.bracket, { name: 'Archon', rate: 53, games: 300 })
  assert.deepEqual(result.matchup, { name: 'Axe', rate: 43, games: 700 })
  assert.ok(result.tips.some((tip) => tip.text.includes('If they are in your lane')))
  assert.ok(result.tips.some((tip) => tip.text.includes('Hex')))
})

test('Turbo shifts the phase and a purchased item drops out of the next-step advice', () => {
  const result = contextualCoach({ ...fixture, mode: 'Turbo' })
  assert.equal(result.phase, 'Mid game')
  assert.equal(result.bracket, null)
  assert.ok(result.tips.some((tip) => tip.items?.includes('blink')))
  const purchased = contextualCoach({ ...fixture, mode: 'Turbo', seen: { blink: 470 } })
  assert.ok(!purchased.tips.some((tip) => tip.items?.includes('blink')))
})

test('Ability Draft stays at role advice when native kit data may be wrong', () => {
  const result = contextualCoach({ ...fixture, mode: 'Ability Draft' })
  assert.equal(result.bracket, null)
  assert.equal(result.matchup, null)
  assert.equal(result.tips.length, 1)
  assert.ok(!result.tips[0].text.includes('Hex'))
})

test('neutral item advice fires when a higher tier is live than what you hold, and stays quiet once you have it', () => {
  const items = { chipped_vest: { neutralTier: 1 }, cloak_of_flames: { neutralTier: 3 } }
  const behind = contextualCoach({ ...fixture, frame: { ...fixture.frame, clock: 18 * 60, items: ['chipped_vest'] }, items })
  assert.ok(behind.tips.some((tip) => tip.text.includes('Tier 2 neutral items') && tip.text.includes('tier 1')))
  const caughtUp = contextualCoach({ ...fixture, frame: { ...fixture.frame, clock: 18 * 60, items: ['cloak_of_flames'] }, items })
  assert.ok(!caughtUp.tips.some((tip) => tip.text.includes('neutral item')))
  const none = contextualCoach({ ...fixture, frame: { ...fixture.frame, clock: 8 * 60, items: [] }, items })
  assert.ok(none.tips.some((tip) => tip.text.includes('Tier 1 neutral items') && !tip.text.includes('tier')))
})

test('coach pairs allied setup with own follow-up and keeps unknown lanes conditional', () => {
  const result = contextualCoach({ ...fixture, allies: [
    { hero: { id: 7, name: 'Earthshaker' }, kit: { a: [{ n: 'Fissure', p: false, c: ['stun'] }] } },
  ] })
  assert.match(result.tips[0].text, /Axe/)
  assert.match(result.tips[1].text, /If you lane with Earthshaker.*Fissure.*Hex/)
})
