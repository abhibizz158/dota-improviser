import assert from 'node:assert/strict'
import test from 'node:test'
import { accountId, matchId, normalizeBuild, normalizeHistory, normalizeMatch, normalizeMatchups, steamId64 } from '../dist/main/main/data.js'
import { OpenDota } from '../dist/main/main/opendota.js'
import { Store } from '../dist/main/main/store.js'
import { atMinute, comparable, practicePace, rankDraft, summarize } from '../dist/main/shared/analysis.js'

const baseMatch = {
  match_id: 9087439951, game_mode: 22, lobby_type: 7, radiant_win: false, duration: 1280,
  start_time: 1787299200, patch: 60, hero_id: 44, player_slot: 128, kills: 9, deaths: 2, assists: 8,
  last_hits: 201, denies: 14, gold_per_min: 656, xp_per_min: 710, position_est: 1,
}

test('account IDs retain exact SteamID64 precision and match IDs are constrained', () => {
  assert.equal(accountId(' 86745912 '), '86745912')
  assert.equal(accountId(steamId64('86745912')), '86745912')
  assert.throws(() => accountId('76561197960265728'))
  assert.throws(() => accountId('4294967295'))
  assert.throws(() => matchId('123/../heroes'))
  assert.throws(() => matchId('9999999999999999'))
})

test('history records preserve absence and derive outcomes from the player side', () => {
  const rows = normalizeHistory([baseMatch, { ...baseMatch, match_id: 9087439952, player_slot: 0, denies: null, position_est: null }])
  assert.deepEqual(rows.map((row) => [row.won, row.role, row.denies, row.patch, row.mode]), [
    [true, 'Carry', 14, '7.41', 'Ranked All Pick'], [false, null, null, '7.41', 'Ranked All Pick'],
  ])
  assert.equal(summarize(rows).winRate, 50)
  assert.equal(summarize(rows).denies, 14)
  assert.equal(summarize([]).kda, null)
  assert.throws(() => normalizeHistory({ error: 'provider failure' }))
})

test('match review handles parsed, anonymous and unparsed records', () => {
  const parsed = normalizeMatch({
    ...baseMatch, objectives: [{ type: 'CHAT_MESSAGE_ROSHAN_KILL', time: 719 }],
    players: [
      { ...baseMatch, account_id: null, times: [0, 300, 600], gold_t: [600, 2000, 5000], xp_t: [0, 940, 2000],
        lh_t: [0, 31, 59], purchase_log: [{ key: 'bfury', time: 691 }],
        deaths_log: [{ key: 'npc_dota_hero_axe', time: 328 }, { key: 'npc_dota_hero_axe', time: 753 }],
        obs_log: [{ time: 123 }] },
      { ...baseMatch, hero_id: 2, player_slot: 0, account_id: 86745912, lane_role: 3, position_est: 3 },
    ],
  })
  const [player, other] = parsed.players
  assert.equal(parsed.parsed, true)
  assert.equal(player.accountId, null)
  assert.equal(other.accountId, '86745912')
  assert.equal(other.role, 'Offlane')
  assert.equal(atMinute(player, 5).lastHits, 31)
  assert.equal(atMinute(player, 10).deaths, 1)
  assert.equal(player.events.find((event) => event.kind === 'item').label, 'Battle Fury')
  assert.equal(player.events.find((event) => event.kind === 'vision').time, 123)
  assert.equal(player.events.find((event) => event.kind === 'objective').time, 719)
  assert.equal(normalizeMatch({ ...baseMatch, players: [baseMatch] }).parsed, false)
  assert.throws(() => normalizeMatch({ ...baseMatch, radiant_win: null, players: [baseMatch] }))
  assert.throws(() => normalizeMatch({ error: 'missing' }))
})

test('personal targets only use observed checkpoints and comparisons reject incompatible matches', () => {
  const [row] = normalizeHistory([baseMatch])
  assert.equal(comparable(row, { ...row, id: '123', patch: '7.40' }), false)
  assert.equal(comparable(row, { ...row, id: '123', mode: 'Turbo' }), false)
  assert.equal(comparable(row, { ...row, id: '123', role: 'Mid' }), false)
  assert.equal(comparable(row, { ...row, id: '123', side: 'Radiant' }), false)
  const a = { ...row, minutes: [{ time: 300, lastHits: 31 }, { time: 600, lastHits: 59 }] }
  const b = { ...row, minutes: [{ time: 300, lastHits: 35 }, { time: 600, lastHits: null }] }
  assert.deepEqual(practicePace([a, b]), [{ minute: 5, lastHits: 33, matches: 2 }])
})

test('draft rankings invert opponent perspective, weight counts and exclude sparse samples', () => {
  const heroes = [1, 2, 3, 4, 5].map((id) => ({ id, name: String(id), roles: id === 5 ? [] : ['Carry'] }))
  const data = { 1: normalizeMatchups([
    { hero_id: 2, games_played: 100, wins: 42 }, { hero_id: 3, games_played: 19, wins: 0 },
    { hero_id: 5, games_played: 100, wins: 23 },
  ]), 4: normalizeMatchups([{ hero_id: 2, games_played: 50, wins: 20 }]) }
  const ranked = rankDraft(heroes, 'Carry', [1, 4], [], [], data)
  assert.deepEqual(ranked.map(({ hero }) => hero.id), [2, 3, 5])
  assert.equal(ranked[0].winRate, 100 * 88 / 150)
  assert.equal(ranked[1].winRate, null)
  assert.deepEqual(rankDraft(heroes, 'Carry', [1], [2], [2, 3], data).map(({ hero }) => hero.id), [3])
  assert.deepEqual(normalizeBuild({ early_game_items: { 1: 63, 9999999: 11 } }).early, [{ item: 'blink', count: 63 }])
})

test('provider reuses inflight reads, respects Retry-After and falls back to cached values', async (context) => {
  const store = new Store(':memory:')
  context.after(() => store.close())
  const provider = new OpenDota(store)
  let calls = 0
  let limited = false
  const mockedFetch = context.mock.method(globalThis, 'fetch', async () => {
    calls++
    return limited ? new Response(null, { status: 429, headers: { 'Retry-After': '60' } }) :
      Response.json([baseMatch])
  })
  const [a, b] = await Promise.all([provider.history('123'), provider.history('123')])
  assert.equal(calls, 1)
  assert.deepEqual(a, b)
  limited = true
  const cached = await provider.history('123', true)
  assert.equal(cached.stale, true)
  assert.equal(cached.updatedAt, a.updatedAt)
  await assert.rejects(provider.history('456'), /rate limiting/)
  assert.equal(mockedFetch.mock.callCount(), 2)
  provider.clear()
  assert.deepEqual(provider.cachedHistory('123'), [])
})

test('parse completion invalidates cached details', async (context) => {
  const store = new Store(':memory:')
  context.after(() => store.close())
  const provider = new OpenDota(store)
  let parsed = false
  let requests = 0
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    if (options.method === 'POST') {
      requests++
      return Response.json({ job: { jobId: '987' } })
    }
    if (url.endsWith('/request/987')) return Response.json(parsed ? null : { jobId: '987' })
    return Response.json({ ...baseMatch, players: [{ ...baseMatch, ...(parsed ? { times: [0], gold_t: [600] } : {}) }] })
  })
  assert.equal((await provider.match('9087439951')).data.parsed, false)
  assert.equal((await provider.requestParse('9087439951')).jobId, '987')
  assert.equal((await provider.requestParse('9087439951')).jobId, '987')
  assert.equal(requests, 1)
  assert.equal((await provider.parseStatus('9087439951')).pending, true)
  parsed = true
  assert.equal((await provider.parseStatus('9087439951')).pending, false)
  assert.equal((await provider.match('9087439951')).data.parsed, true)
})
