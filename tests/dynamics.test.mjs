import assert from 'node:assert/strict'
import test from 'node:test'
import { newTrack, trackFrame } from '../dist/main/shared/game.js'
import { classifyStyle } from '../dist/main/shared/style.js'
import { buildTimeline } from '../dist/main/main/data.js'

const F = (o) => ({ clock: 100, heroSlug: 'axe', heroId: 2, level: 5, alive: true, gold: 500, gpm: 400, xpm: 500, lastHits: 20, denies: 2, kills: 0, deaths: 0, assists: 0,
  items: [], paused: false, matchmaking: true, team: 'Radiant', radiantScore: 0, direScore: 0, killStreak: 0, ...o })
const ids = (events) => events.map((e) => e.label)

test('first blood: who got it and whether it was you', () => {
  const t = newTrack()
  trackFrame(t, F({ clock: 120 }))
  const e = trackFrame(t, F({ clock: 150, kills: 1, radiantScore: 1 }))
  assert.deepEqual(ids(e), ['First Blood: you!'])
  assert.equal(t.firstBlood.you, true)
  const t2 = newTrack(); trackFrame(t2, F({ clock: 100 }))
  assert.deepEqual(ids(trackFrame(t2, F({ clock: 130, direScore: 1 }))), ['First Blood: enemy team'])
  const t3 = newTrack(); trackFrame(t3, F({ clock: 100, team: 'Dire' }))
  assert.deepEqual(ids(trackFrame(t3, F({ clock: 130, team: 'Dire', direScore: 1 }))), ['First Blood: your team'])
  assert.deepEqual(trackFrame(t, F({ clock: 160, radiantScore: 2 })).map((x) => x.id), []) // only once
})

test('kills chained within 18s become double, triple, ultra, rampage; slower kills reset', () => {
  const t = newTrack()
  trackFrame(t, F({ clock: 190, kills: 0 }))
  assert.deepEqual(ids(trackFrame(t, F({ clock: 200, kills: 1 }))), [])
  assert.deepEqual(ids(trackFrame(t, F({ clock: 210, kills: 2 }))), ['DOUBLE KILL'])
  assert.deepEqual(ids(trackFrame(t, F({ clock: 225, kills: 3 }))), ['TRIPLE KILL'])
  assert.deepEqual(ids(trackFrame(t, F({ clock: 250, kills: 4 }))), []) // 25s gap resets the chain
  assert.equal(t.best, 'Triple Kill')
  const r = newTrack(); trackFrame(r, F({ clock: 290, kills: 0 }))
  const out = trackFrame(r, F({ clock: 300, kills: 5 }))
  assert.deepEqual(ids(out), ['DOUBLE KILL', 'TRIPLE KILL', 'ULTRA KILL', 'RAMPAGE'])
  assert.equal(out.at(-1).epic, true)
  assert.equal(r.best, 'Rampage')
})

test('kill streaks announce once per level and reset on death', () => {
  const t = newTrack()
  assert.deepEqual(ids(trackFrame(t, F({ killStreak: 3 }))), ['KILLING SPREE'])
  assert.deepEqual(ids(trackFrame(t, F({ killStreak: 3 }))), [])
  assert.deepEqual(ids(trackFrame(t, F({ killStreak: 5 }))), ['DOMINATING', 'MEGA KILL'])
  trackFrame(t, F({ killStreak: 0 }))
  assert.deepEqual(ids(trackFrame(t, F({ killStreak: 3 }))), ['KILLING SPREE'])
})

test('milestones fire once and the momentum series follows the kill lead', () => {
  const t = newTrack()
  const e = trackFrame(t, F({ clock: 605, deaths: 0, lastHits: 64, radiantScore: 5, direScore: 2 }))
  assert.deepEqual(e.map((x) => x.id).sort(), ['cs-60', 'no-death-10'])
  assert.deepEqual(trackFrame(t, F({ clock: 620, deaths: 0, lastHits: 70, radiantScore: 5, direScore: 2 })), [])
  trackFrame(t, F({ clock: 700, radiantScore: 5, direScore: 6 }))
  assert.deepEqual(t.lead.map(([, v]) => v), [3, -1])
})

const M = (o) => ({ id: String(Math.random()), start: 1, duration: 1800, won: true, kills: 5, deaths: 4, assists: 8, lastHits: 200, denies: 10, gpm: 600, xpm: 600, role: 'Carry', heroId: 1, ...o })
const H = (tags) => [{ id: 1, slug: 'a', name: 'A', roles: tags }]
test('playstyle: carry, dynamic support and utility support are told apart; too little data returns null', () => {
  assert.equal(classifyStyle(Array.from({ length: 4 }, () => M({})), H(['Carry'])), null)
  const carry = classifyStyle(Array.from({ length: 10 }, () => M({ lastHits: 240 })), H(['Carry']))
  assert.equal(carry.primary.name, 'Hard Carry')
  const dyn = classifyStyle(Array.from({ length: 10 }, () => M({ role: 'Soft support', lastHits: 60, gpm: 420, kills: 3, assists: 18 })), H(['Support']))
  assert.equal(dyn.primary.name, 'Dynamic Support')
  const util = classifyStyle(Array.from({ length: 10 }, () => M({ role: 'Hard support', lastHits: 20, gpm: 280, kills: 1, assists: 15 })), H(['Support']))
  assert.equal(util.primary.name, 'Utility Support')
  assert.ok(util.advice.length >= 3 && carry.traits.length === 4)
})

test('post-match timeline: towers by tier/lane/team, barracks, Roshan, first blood, advantage arrays', () => {
  const t = buildTimeline({
    first_blood_time: 95, radiant_gold_adv: [0, 100, -50], radiant_xp_adv: [0, 40],
    objectives: [
      { type: 'building_kill', key: 'npc_dota_badguys_tower2_mid', time: 900 }, { type: 'building_kill', key: 'npc_dota_goodguys_tower1_top', time: 600 },
      { type: 'building_kill', key: 'npc_dota_goodguys_melee_rax_bot', time: 1500 }, { type: 'CHAT_MESSAGE_ROSHAN_KILL', time: 1200 },
      { type: 'building_kill', key: 'npc_dota_badguys_tower4', time: 1700 },
    ],
  })
  assert.deepEqual(t.towers, [{ team: 'Radiant', tier: 1, lane: 'Top', time: 600 }, { team: 'Dire', tier: 2, lane: 'Mid', time: 900 }, { team: 'Dire', tier: 4, lane: 'Base', time: 1700 }])
  assert.deepEqual(t.barracks, [{ team: 'Radiant', lane: 'Bot', kind: 'Melee', time: 1500 }])
  assert.deepEqual(t.roshan, [1200])
  assert.equal(t.firstBlood, 95)
  assert.deepEqual(t.goldAdv, [0, 100, -50])
})
