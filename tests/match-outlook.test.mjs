import assert from 'node:assert/strict'
import test from 'node:test'
import { comebackLow, matchEstimate, recordOutlook } from '../dist/main/shared/match-outlook.js'
import { parseResultFrame } from '../dist/main/main/gsi.js'

const assumptions = { draftWin: 54, allies: null, enemies: null, coach: null, mode: 'Ranked' }
const estimate = (frame, context = {}) => matchEstimate({
  ...assumptions, ...context, frame: { clock: 1200, team: 'Radiant', radiantScore: 10, direScore: 20, alive: true, ...frame },
})

test('live estimate reflects the player side, team score changes and phase', () => {
  assert.ok(estimate({}).win < 50)
  assert.ok(estimate({ team: 'Dire' }).win > 50)
  assert.ok(estimate({ radiantScore: 22 }).win > estimate({}).win)
  assert.ok(estimate({ clock: 2000 }).win < estimate({ clock: 600 }).win)
  assert.ok(estimate({ alive: false, respawnSeconds: 65 }).win <= estimate({}).win)
})

test('missing team data stays lineup-only or unavailable', () => {
  const missing = { radiantScore: null, direScore: null }
  assert.equal(estimate(missing).scope, 'Lineup only')
  assert.equal(estimate(missing, { draftWin: null }), null)
  assert.equal(estimate(missing, { mode: 'Ability Draft' }), null)
})

test('timeline is sampled and only a sustained live deficit followed by a verified win awards a comeback', () => {
  const first = [{ at: 600, win: 42, lead: -2 }]
  assert.equal(recordOutlook(first, { at: 605, win: 38, lead: -3 }), first)
  assert.equal(comebackLow(first, true), null)
  const behind = recordOutlook(first, { at: 615, win: 38, lead: -3 })
  const final = recordOutlook(behind, { at: 1300, win: 100, lead: 3 }, true)
  assert.equal(comebackLow(final, true), 38)
  assert.equal(comebackLow(final, false), null)
  assert.equal(comebackLow(final, null), null)
  assert.equal(comebackLow([first[0], { at: 680, win: 38, lead: -3 }], true), null)
  assert.equal(comebackLow(final.map((p) => ({ ...p, lead: null })), true), null)
})

test('final winner is read from the linked player’s authenticated post-game team', () => {
  const steamId = '76561197960265770'
  const packet = {
    provider: { appid: 570 },
    player: { steamid: steamId, team_name: 'dire', activity: 'playing' },
    hero: { name: 'npc_dota_hero_axe' },
    map: { game_state: 'DOTA_GAMERULES_STATE_POST_GAME', clock_time: 1200, matchid: '123456789', win_team: 'dire' },
  }
  assert.equal(parseResultFrame(packet, steamId).won, true)
  assert.equal(parseResultFrame({ ...packet, map: { ...packet.map, win_team: 'radiant' } }, steamId).won, false)
  assert.equal(parseResultFrame(packet, '76561197960265771'), null)
})
