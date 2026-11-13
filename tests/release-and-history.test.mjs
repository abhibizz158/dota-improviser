import assert from 'node:assert/strict'
import test from 'node:test'
import { selectRelease } from '../dist/main/main/release-selection.js'
import { mergeHistory, parsePrivateHistory } from '../dist/main/main/private-history.js'
import { parseCompletedOwnMatch, parseFrame } from '../dist/main/main/gsi.js'

const asset = (version, platform = 'macos-arm64.pkg') => ({
  id: 10, name: `Dota-Improviser-${version}-${platform}`, digest: 'sha256:' + 'a'.repeat(64), size: 100, state: 'uploaded',
})

test('updater rejects drafts, downgrades, wrong architectures and assets without digests', () => {
  const release = (v, a, draft = false) => ({ tag_name: 'v' + v, draft, assets: [a] })
  const values = [
    release('2.0.0', asset('2.0.0'), true),
    release('1.0.0', asset('1.0.0', 'macos-x64.pkg')),
    release('0.3.0', { ...asset('0.3.0'), digest: undefined }),
    release('0.1.9', asset('0.1.9')), release('0.1.10', asset('0.1.10')),
  ]
  assert.equal(selectRelease(values, '0.1.8', 'darwin', 'arm64')?.next, '0.1.10')
  assert.equal(selectRelease(values, '0.1.10', 'darwin', 'arm64'), null)
  assert.equal(selectRelease(values, '0.1.8', 'win32', 'x64'), null)
})

test('private rows import without public data and merge missing metrics without duplicates', () => {
  const [row] = parsePrivateHistory('match_id,hero,side,result,date,duration,kills,deaths,assists,gpm,xpm,last_hits,denies\n8123456789,Axe,Radiant,Win,2026-01-20,1800,3,2,5,400,,100,')
  assert.equal(row.source, 'local')
  assert.equal(row.xpm, null)
  assert.equal(row.gpm, 400)
  const [merged] = mergeHistory([{ ...row, gpm: null, xpm: 500 }], [row])
  assert.equal(merged.gpm, 400)
  assert.equal(merged.xpm, 500)
  assert.throws(() => parsePrivateHistory('8123456789,Axe,Dire,Win,2026-02-30'))
  assert.throws(() => parsePrivateHistory('8123456789,Axe,Dire,Win,2026-01-20,1800,-2'))
})

test('local GSI history only accepts a completed own match and never qualifies it for the overlay', () => {
  const id = '76561197960265770'
  const packet = {
    provider: { appid: 570 }, map: { matchid: '8123456789', clock_time: 1800, win_team: 'radiant', game_state: 'DOTA_GAMERULES_STATE_POST_GAME' },
    player: { steamid: id, activity: 'playing', team_name: 'radiant', kills: 6, deaths: 1 }, hero: { name: 'npc_dota_hero_axe' },
  }
  assert.equal(parseCompletedOwnMatch(packet, id)?.won, true)
  assert.equal(parseCompletedOwnMatch(packet, '76561197960265771'), null)
  assert.equal(parseCompletedOwnMatch({ ...packet, map: { ...packet.map, spectating: true } }, id), null)
  const live = { ...packet, map: { ...packet.map, game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' } }
  assert.equal(parseCompletedOwnMatch(live, id), null)
  assert.equal(parseFrame(live, id, false), null)
  assert.equal(parseFrame(packet, id, false), null)
})
