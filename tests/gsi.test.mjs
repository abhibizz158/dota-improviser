import assert from 'node:assert/strict'
import test from 'node:test'
import { gsiConfig, parsePick, parsePracticeLane, redactedShape, startGsi, updateCheckpoints } from '../dist/main/main/gsi.js'

const steamId = '76561198047011640'
const practice = {
  auth: { token: 'private-local-token' },
  provider: { appid: 570 },
  player: { steamid: steamId, team_name: 'radiant', activity: 'playing', name: 'Private player name', last_hits: 32, denies: 6, deaths: 1 },
  map: { matchid: '0', lobby_type: 1, game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS', clock_time: 300, paused: false },
  hero: { name: 'npc_dota_hero_phantom_assassin', level: 6, x: 30000 },
  items: { slot0: { name: 'untrusted payload' } },
}

test('practice lane uses a fixed own-player projection and null for missing stats', () => {
  assert.deepEqual(parsePracticeLane(practice, steamId), {
    clock: 300, heroSlug: 'phantom_assassin', lastHits: 32, denies: 6, deaths: 1, level: 6, paused: false,
  })
  assert.equal(parsePracticeLane({ ...practice, player: { ...practice.player, denies: undefined } }, steamId).denies, null)
  assert.equal(parsePracticeLane({ ...practice, map: { ...practice.map, paused: true } }, steamId).paused, true)
  const diagnostic = JSON.stringify(redactedShape(practice, true))
  for (const privateValue of [steamId, practice.auth.token, practice.player.name, practice.hero.name, 'untrusted payload']) {
    assert.equal(diagnostic.includes(privateValue), false)
  }
})

test('practice gate rejects multiplayer, spectators, replays, unknown phases and other accounts', () => {
  for (const patch of [
    { map: { ...practice.map, matchid: '9087439951' } },
    { map: { ...practice.map, lobby_type: 7 } },
    { map: { ...practice.map, lobby_type: 4 } },
    { map: { ...practice.map, lobby_type: undefined, matchid: '9087439951' } },
    { map: { ...practice.map, matchid: undefined } },
    { map: { ...practice.map, game_state: 'DOTA_GAMERULES_STATE_POST_GAME' } },
    { map: { ...practice.map, replay: true } },
    { map: { ...practice.map, spectating: true } },
    { player: { team2: { player0: practice.player } } },
    { hero: { ...practice.hero, team2: {} } },
    { player: { ...practice.player, steamid: '76561197960265729' } },
    { player: { ...practice.player, activity: 'spectating' } },
  ]) assert.equal(parsePracticeLane({ ...practice, ...patch }, steamId), null)
})

test('checkpoint tracking requires continuous data and resets on a new session', () => {
  const lane = parsePracticeLane(practice, steamId)
  const checkpoint = [{ minute: 5, lastHits: 32 }]
  assert.deepEqual(updateCheckpoints({ ...lane, clock: 298 }, lane, []), checkpoint)
  assert.deepEqual(updateCheckpoints({ ...lane, clock: 285 }, lane, []), [])
  assert.deepEqual(updateCheckpoints({ ...lane, clock: 298 }, { ...lane, paused: true }, []), [])
  assert.deepEqual(updateCheckpoints(lane, { ...lane, clock: 0 }, checkpoint), [])
  assert.deepEqual(updateCheckpoints(lane, null, checkpoint), [])
})

test('loopback receiver accepts only token-authenticated bounded game POSTs', async (context) => {
  const seen = []
  const { server, port } = await startGsi(practice.auth.token, (value) => seen.push(value), 0)
  context.after(() => new Promise((resolve) => {
    server.close(resolve)
    server.closeAllConnections()
  }))
  assert.equal(server.address().address, '127.0.0.1')
  assert.match(gsiConfig(port, practice.auth.token), new RegExp('127.0.0.1:' + port + '/gsi'))
  const endpoint = 'http://127.0.0.1:' + port + '/gsi'
  const send = (value, headers = {}) => fetch(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: value,
  })
  assert.equal((await send(JSON.stringify(practice), { origin: 'https://example.com' })).status, 403)
  assert.equal((await send(JSON.stringify(practice), { 'content-type': 'text/plain' })).status, 403)
  assert.equal((await send('bad json')).status, 400)
  assert.equal((await send(JSON.stringify({ ...practice, auth: { token: 'wrong' } }))).status, 401)
  assert.equal((await send(JSON.stringify({ ...practice, large: 'x'.repeat(100000) }))).status, 413)
  assert.equal((await send(JSON.stringify(practice))).status, 204)
  assert.equal(seen.length, 1)
})

test('current Dota builds omit lobby_type: zero matchid still marks practice', () => {
  const { lobby_type, ...map } = practice.map
  assert.equal(parsePracticeLane({ ...practice, map }, steamId)?.clock, 300)
})

test('pick phase exposes only own side and locked hero; never trusts draft payload', () => {
  const pickPacket = { provider: { appid: 570 }, player: { steamid: steamId, team_name: 'dire' }, hero: { id: 0 },
    map: { game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' }, draft: { fake: 'enemy picks' } }
  assert.deepEqual(parsePick(pickPacket, steamId), { team: 'Dire', heroId: null })
  assert.deepEqual(parsePick({ ...pickPacket, hero: { id: 44 } }, steamId), { team: 'Dire', heroId: 44 })
  assert.equal(parsePick(pickPacket, '1'), null)
  assert.equal(parsePick({ ...pickPacket, map: { game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' } }, steamId), null)
  assert.equal(parsePick({ ...pickPacket, map: { ...pickPacket.map, spectating: true } }, steamId), null)
  assert.match(gsiConfig(1, 't'), /"draft" "1"/)
})
