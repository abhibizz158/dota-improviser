import assert from 'node:assert/strict'
import test from 'node:test'
import { coach, percentileOf, timingTargets } from '../dist/main/shared/coach.js'
import { mergeDraftSlots } from '../dist/main/shared/draft-picks.js'
import { parseDraft, parseFrame } from '../dist/main/main/gsi.js'

const P = [0.1, 0.3, 0.5, 0.7, 0.9, 0.99]
const data = { pick: [], win: [], pro: [0, 0, 0], turbo: [0, 0],
  bench: { gpm: [300, 380, 460, 540, 620, 750], xpm: [380, 450, 520, 600, 680, 800], lhpm: [3, 4, 5, 6, 7, 9], kpm: [], dpm: [] },
  items: { starting: [], early: [['hand_of_midas', 9]], mid: [['bfury', 9], ['black_king_bar', 8]], late: [] } }
const frame = (o) => ({ clock: 600, heroSlug: 'juggernaut', heroId: 8, level: 10, alive: true, gold: 300, gpm: 460, xpm: 520, lastHits: 50,
  denies: 5, kills: 2, deaths: 1, assists: 3, items: [], paused: false, matchmaking: true, ...o })

test('percentileOf interpolates a benchmark ladder', () => {
  assert.equal(Math.round(percentileOf(460, data.bench.gpm, P)), 50)
  assert.equal(Math.round(percentileOf(500, data.bench.gpm, P)), 60)
  assert.ok(percentileOf(900, data.bench.gpm, P) <= 99.9)
})

test('coach scores pace, flags low farm and unspent gold, tracks item achievements', () => {
  const seen = {}
  const good = coach(frame({ gpm: 620, xpm: 680, lastHits: 70 }), data, P, 'Carry', seen)
  const bad = coach(frame({ gpm: 300, lastHits: 20, gold: 2000, deaths: 6 }), data, P, 'Carry', {})
  assert.ok(good.score > bad.score)
  assert.ok(bad.tips.some((t) => /unspent/.test(t.text)))
  assert.ok(bad.tips.some((t) => /GPM/.test(t.text)))
  const early = coach(frame({ clock: 540, items: ['bfury'] }), data, P, 'Carry', seen)
  assert.equal(early.achievements.find((a) => a.id === 'bfury').state, 'done') // Battle Fury at 9:00, par 10:00
  const late = coach(frame({ clock: 800, items: ['bfury'] }), data, P, 'Carry', {})
  assert.equal(late.achievements.find((a) => a.id === 'bfury').state, 'late-done')
  assert.equal(coach(frame({ clock: 700 }), data, P, 'Carry', {}).achievements.find((a) => a.id === 'bfury').state, 'missed')
})

test('coach stays quiet with no benchmark data or before minute 4', () => {
  assert.equal(coach(frame({ clock: 100 }), data, P, 'Carry', {}).score, null)
  assert.equal(coach(frame(), undefined, P, 'Carry', {}).benchmarkAvailable, false)
})

test('matchmaking frames need explicit opt-in; own items parsed from inventory only', () => {
  const pkt = { provider: { appid: 570 }, player: { steamid: '1', team_name: 'dire', activity: 'playing', gold: 900, gpm: 400 },
    map: { matchid: '123456', game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS', clock_time: 700 }, hero: { name: 'npc_dota_hero_juggernaut', level: 9 },
    items: { slot0: { name: 'item_bfury' }, slot1: { name: 'empty' }, stash0: { name: 'item_tango' }, neutral0: { name: 'item_arcane_ring' }, junk: { name: 'item_evil' } } }
  assert.equal(parseFrame(pkt, '1', false), null)
  const f = parseFrame(pkt, '1', true)
  assert.deepEqual(f.items, ['bfury', 'tango', 'arcane_ring'])
  assert.equal(f.matchmaking, true)
})

test('draft reveal reads picks/bans per team in waves', () => {
  const wave1 = { draft: { activeteam: 3, activeteam_time_remaining: 21, team2: { pick0_class: 'npc_dota_hero_juggernaut', pick0_id: 8, pick1_class: 'npc_dota_hero_axe', ban0_class: 'npc_dota_hero_pudge' }, team3: {} } }
  const d = parseDraft(wave1)
  assert.deepEqual(d.radiant.picks, [8, 2])
  assert.deepEqual(d.radiant.bans, [14])
  assert.deepEqual(d.dire.picks, [])
  assert.equal(d.activeTeam, 'Dire')
  assert.equal(parseDraft({ draft: {} }), null)
})

test('coach compares against your own learned average on the hero', () => {
  const mine = { n: 8, gpm: 600, xpm: 650, lhpm: 6 }
  const low = coach(frame({ clock: 900, gpm: 450 }), data, P, 'Carry', {}, mine)
  assert.ok(low.tips.some((t) => /below your own average/.test(t.text)))
  assert.deepEqual(low.personal, { gpm: 600, xpm: 650, n: 8 })
  const high = coach(frame({ clock: 900, gpm: 700 }), data, P, 'Carry', {}, mine)
  assert.ok(high.tips.some((t) => /beats your usual/.test(t.text)))
  assert.equal(coach(frame({ clock: 900 }), data, P, 'Carry', {}, { ...mine, n: 1 }).personal, null)
})

test('item achievement targets come from real timing win rates when available', () => {
  // Battle Fury buckets from OpenDota: [seconds, games, wins]
  const rows = [[450, 13, 9], [600, 26, 17], [720, 57, 35], [900, 204, 116], [1200, 248, 96]]
  assert.deepEqual(timingTargets(rows), { par: 900, elite: 720, winPct: 57 }) // 450 skipped (<15 games); 1200 wins only 39%
  assert.equal(timingTargets([[600, 5, 5]]), null)
  const timings = { bfury: rows }
  const fast = coach(frame({ clock: 700, items: ['bfury'] }), data, P, 'Carry', { bfury: 640 }, undefined, timings)
  const a = fast.achievements.find((x) => x.id === 'bfury')
  assert.equal(a.state, 'done')
  assert.equal(a.elite, true)
  assert.match(a.label, /15:00 · 57% wins/)
  assert.equal(coach(frame({ clock: 700, items: ['bfury'] }), data, P, 'Carry', { bfury: 800 }, undefined, timings).achievements.find((x) => x.id === 'bfury').elite, false)
})

test('coach exposes phase, next goal, stats and medians for the detailed overlay', () => {
  const v = coach(frame({ clock: 400, gold: 800, kills: 2, deaths: 1, assists: 3, lastHits: 30, denies: 4, level: 6 }), data, P, 'Carry', {})
  assert.equal(v.phase, 'Laning')
  assert.deepEqual(v.stats, { kills: 2, deaths: 1, assists: 3, lastHits: 30, denies: 4, level: 6, gold: 800 })
  assert.equal(v.medians.gpm, 460)
  assert.equal(v.nextGoal.left, 80) // Hand of Midas par 8:00 is the earliest live goal at 6:40
  assert.equal(coach(frame({ clock: 1600 }), data, P, 'Carry', {}).phase, 'Late game')
})

test('partial draft rounds preserve other slots and replace a changed pick', () => {
  const round = (team3) => parseDraft({ draft: { team3 } }).dire.slots
  const first = round({ pick1_id: 94, pick0_id: 2 })
  assert.equal(mergeDraftSlots(first, round({ pick0_id: 2 })), first)
  const second = mergeDraftSlots(first, round({ pick2_id: 7 }))
  assert.deepEqual([...second], [[0, 2], [1, 94], [2, 7]])
  assert.deepEqual([...mergeDraftSlots(second, round({ pick1_id: 1 }))], [[0, 2], [1, 1], [2, 7]])
})
