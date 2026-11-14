import { createServer } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { asRecord, heroById, heroBySlug, number } from './data.js'
import type { Checkpoint, DraftReveal, Frame, Lane, MatchSummary, Pick } from '../shared/model.js'
import { allowedGsiSections } from '../shared/guard.js'

const activePhases = new Set(['DOTA_GAMERULES_STATE_PRE_GAME', 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS'])
const visionPhases = new Set(['DOTA_GAMERULES_STATE_HERO_SELECTION', 'DOTA_GAMERULES_STATE_STRATEGY_TIME'])
const pickPhases = new Set([...visionPhases, 'DOTA_GAMERULES_STATE_PLAYER_DRAFT'])
const loadingPhases = new Set(['DOTA_GAMERULES_STATE_TEAM_SHOWCASE', 'DOTA_GAMERULES_STATE_WAIT_FOR_MAP_TO_LOAD'])

export function draftVisionPhase(value: unknown, pick: Pick | null) {
  return pick != null && visionPhases.has(String(asRecord(asRecord(value).map).game_state))
}

export function loadingDraft(value: unknown, expectedSteamId: string) {
  const packet = asRecord(value)
  const map = asRecord(packet.map)
  const player = asRecord(packet.player)
  return asRecord(packet.provider).appid === 570 && expectedSteamId !== '' &&
    (player.steamid == null || player.steamid === expectedSteamId) && player.activity !== 'spectating' &&
    map.spectating !== true && map.replay !== true &&
    loadingPhases.has(String(map.game_state))
}
const practiceLobbyTypes = new Set([1, '1', 'DOTA_LOBBY_TYPE_PRACTICE'])
const maxBody = 96 * 1024

const stat = (value: unknown) => {
  const result = number(value)
  return result != null && Number.isSafeInteger(result) && result >= 0 ? result : null
}

function gate(value: unknown, expectedSteamId: string, matchmaking: boolean, phases = activePhases) {
  const packet = asRecord(value)
  const map = asRecord(packet.map)
  const player = asRecord(packet.player)
  const hero = asRecord(packet.hero)
  const provider = asRecord(packet.provider)
  const lobby = map.lobby_type ?? map.lobbytype
  const clock = number(map.clock_time)
  const heroSlug = typeof hero.name === 'string' && /^npc_dota_hero_[a-z0-9_]+$/.test(hero.name)
    ? hero.name.slice('npc_dota_hero_'.length) : null
  if (provider.appid !== 570 || !expectedSteamId || player.steamid !== expectedSteamId ||
    player.activity !== 'playing' || !['radiant', 'dire'].includes(String(player.team_name).toLowerCase()) ||
    // Current Dota builds omit lobby_type; real matches carry a nonzero matchid, so zero is the practice marker.
    (!matchmaking && (![0, '0'].includes(map.matchid as string | number) || (lobby != null && !practiceLobbyTypes.has(lobby as string | number)))) ||
    map.spectating === true || map.replay === true || !phases.has(String(map.game_state)) || clock == null || clock < -600 || clock > 21600 || !heroSlug ||
    [player, hero].some((section) => Object.keys(section).some((key) => /^(team\d+|player\d+|radiant|dire)$/.test(key)))) return null
  return { packet, map, player, hero, clock, heroSlug }
}

const completedPhases = new Set(['DOTA_GAMERULES_STATE_POST_GAME'])
/** This projection is only used for local history, after a result is available. */
export function parseCompletedOwnMatch(value: unknown, expectedSteamId: string, now = Date.now()): MatchSummary | null {
  const g = gate(value, expectedSteamId, true, completedPhases)
  if (!g) return null
  const id = String(g.map.matchid ?? '')
  const winner = String(g.map.win_team ?? '').toLowerCase()
  const heroId = heroBySlug.get(g.heroSlug)
  if (!/^[1-9]\d{5,14}$/.test(id) || !['radiant', 'dire'].includes(winner) || !heroId || g.clock < 0) return null
  const side = String(g.player.team_name).toLowerCase() === 'dire' ? 'Dire' : 'Radiant'
  return { id, heroId, side, start: Math.floor(now / 1000) - Math.floor(g.clock), duration: Math.floor(g.clock),
    won: side.toLowerCase() === winner, kills: stat(g.player.kills), deaths: stat(g.player.deaths), assists: stat(g.player.assists),
    gpm: stat(g.player.gpm), xpm: stat(g.player.xpm), lastHits: stat(g.player.last_hits), denies: stat(g.player.denies),
    patch: '', mode: '', role: null, source: 'local', status: 'completed' }
}

/** Own item keys from the player's own inventory: slots, backpack, stash, neutral. */
export function ownItems(value: unknown) {
  return Object.entries(asRecord(value)).flatMap(([slot, item]) => {
    const name = asRecord(item).name
    return /^(slot|stash|neutral|teleport)\d*$/.test(slot) && typeof name === 'string' && /^item_[a-z0-9_]+$/.test(name) ? [name.slice(5)] : []
  })
}

/** Full own-player frame for the live coach. matchmaking=false restricts to practice lobbies. */
export function parseFrame(value: unknown, expectedSteamId: string, matchmaking: boolean): Frame | null {
  const g = gate(value, expectedSteamId, matchmaking)
  if (!g) return null
  return projectFrame(g)
}

export function parseResultFrame(value: unknown, expectedSteamId: string) {
  const result = gate(value, expectedSteamId, true, completedPhases)
  return result && ['radiant', 'dire'].includes(String(result.map.win_team).toLowerCase()) ? projectFrame(result) : null
}

function projectFrame(g: NonNullable<ReturnType<typeof gate>>): Frame {
  const { packet, player, hero } = g
  return {
    matchId: /^[1-9]\d{5,14}$/.test(String(g.map.matchid ?? '')) ? String(g.map.matchid) : undefined,
    clock: Math.floor(g.clock), heroSlug: g.heroSlug, heroId: heroBySlug.get(g.heroSlug) ?? null, level: stat(hero.level),
    alive: hero.alive !== false, respawnSeconds: hero.alive === false ? stat(hero.respawn_seconds) : null,
    gold: stat(player.gold), gpm: stat(player.gpm), xpm: stat(player.xpm),
    lastHits: stat(player.last_hits), denies: stat(player.denies), kills: stat(player.kills), deaths: stat(player.deaths),
    assists: stat(player.assists), items: ownItems(packet.items), itemsObserved: Object.keys(asRecord(packet.items)).some((key) => /^slot\d+$/.test(key)), paused: g.map.paused === true,
    matchmaking: ![0, '0'].includes(g.map.matchid as string | number),
    team: String(player.team_name).toLowerCase() === 'dire' ? 'Dire' : 'Radiant', radiantScore: stat(g.map.radiant_score), direScore: stat(g.map.dire_score), killStreak: stat(player.kill_streak),
  }
}

export function parsePracticeLane(value: unknown, expectedSteamId: string): Lane | null {
  const g = gate(value, expectedSteamId, false)
  if (!g) return null
  return {
    clock: Math.floor(g.clock), heroSlug: g.heroSlug, lastHits: stat(g.player.last_hits), denies: stat(g.player.denies),
    deaths: stat(g.player.deaths), level: stat(g.hero.level), paused: g.map.paused === true,
  }
}

export function updateCheckpoints(previous: Lane | null, next: Lane | null, values: Checkpoint[]) {
  if (!previous || !next || previous.heroSlug !== next.heroSlug || next.clock < previous.clock) return []
  if (next.paused || next.lastHits == null) return values
  const lastHits = next.lastHits
  return [...values, ...([5, 10] as const).flatMap((minute) => {
    const time = minute * 60
    return previous.clock < time && next.clock >= time && next.clock <= time + 8 &&
      next.clock - previous.clock <= 12 && !values.some((value) => value.minute === minute)
      ? [{ minute, lastHits }] : []
  })]
}

/** Draft reveal as Dota sends it (team2 = Radiant, team3 = Dire). Reveals arrive in waves; this just reads whatever is present. */
export function parseDraft(value: unknown): DraftReveal | null {
  const draft = asRecord(asRecord(value).draft)
  if (!Object.keys(draft).length) return null
  const side = (raw: unknown) => {
    const team = asRecord(raw)
    const read = (kind: 'pick' | 'ban', length: number) => Array.from({ length }, (_, index) => index).flatMap((index) => {
      const heroClass = team[`${kind}${index}_class`]
      const slug = typeof heroClass === 'string' ? heroClass.replace(/^npc_dota_hero_/, '') : ''
      const id = heroBySlug.get(slug) ?? stat(team[`${kind}${index}_id`])
      return id != null && heroById.has(id) ? [id] : []
    })
    return { picks: [...new Set(read('pick', 5))], bans: [...new Set(read('ban', 12))] }
  }
  const active = number(draft.activeteam)
  return {
    radiant: side(draft.team2), dire: side(draft.team3), activeTeam: active === 2 ? 'Radiant' : active === 3 ? 'Dire' : null,
    timeLeft: number(draft.activeteam_time_remaining),
  }
}

/** Verify that a draft packet belongs to the linked player before using its own hero or draft reveals. */
export function parsePick(value: unknown, expectedSteamId: string): Pick | null {
  const packet = asRecord(value)
  const map = asRecord(packet.map)
  const player = asRecord(packet.player)
  const team = String(player.team_name).toLowerCase()
  if (asRecord(packet.provider).appid !== 570 || !expectedSteamId || player.steamid !== expectedSteamId ||
    !['radiant', 'dire'].includes(team) ||
    (player.activity != null && player.activity !== 'playing') || Object.keys(player).some((key) => /^(team\d+|player\d+|radiant|dire)$/.test(key)) || map.spectating === true || map.replay === true ||
    !pickPhases.has(String(map.game_state))) return null
  const hero = asRecord(packet.hero)
  if (Object.keys(hero).some((key) => /^(team\d+|player\d+|radiant|dire)$/.test(key))) return null
  const id = stat(hero.id)
  const slugId = typeof hero.name === 'string' && hero.name.startsWith('npc_dota_hero_') ? heroBySlug.get(hero.name.slice(14)) : undefined
  return { team: team === 'radiant' ? 'Radiant' : 'Dire', heroId: id != null && heroById.has(id) ? id : slugId ?? null }
}

export function redactedShape(value: unknown, accepted: boolean) {
  const packet = asRecord(value)
  const map = asRecord(packet.map)
  const lobby = map.lobby_type ?? map.lobbytype
  const sections = {
    provider: ['appid'], map: ['matchid', 'lobby_type', 'lobbytype', 'game_state', 'clock_time', 'paused'],
    player: ['steamid', 'activity', 'team_name', 'last_hits', 'denies', 'deaths'], hero: ['name', 'level'],
  }
  return {
    receivedAt: new Date().toISOString(),
    accepted,
    context: {
      matchId: [0, '0'].includes(map.matchid as string | number) ? 'zero' : map.matchid == null ? 'missing' : 'nonzero',
      lobby: practiceLobbyTypes.has(lobby as string | number) ? 'practice' : lobby == null ? 'missing' : 'other',
      activePhase: activePhases.has(String(map.game_state)),
    },
    fields: Object.fromEntries(Object.entries(sections).map(([name, fields]) => {
      const section = asRecord(packet[name])
      return [name, Object.fromEntries(fields.map((field) => [field, typeof section[field]]))]
    })),
  }
}

export function gsiConfig(port: number, token: string) {
  return [
    '"Dota Improviser"', '{', '  "uri" "http://127.0.0.1:' + port + '/gsi"',
    '  "timeout" "2.0"', '  "buffer" "0.1"', '  "throttle" "1.0"', '  "heartbeat" "5.0"',
    '  "auth"', '  {', '    "token" "' + token + '"', '  }',
    '  "data"', '  {', ...allowedGsiSections.map((name) => '    "' + name + '" "1"'), '  }', '}', '',
  ].join('\n')
}

export async function startGsi(token: string, onPacket: (packet: unknown) => void, port = 43182) {
  const expected = Buffer.from(token)
  const server = createServer({ requestTimeout: 5000, headersTimeout: 5000, connectionsCheckingInterval: 1000 }, (request, response) => {
    const end = (status: number) => { if (!response.writableEnded) response.writeHead(status).end() }
    const json = request.headers['content-type']?.split(';')[0].trim().toLowerCase()
    // Source integrations may omit Content-Type. Reject browser origins and browser-simple text/form payloads.
    if (request.method !== 'POST' || request.url !== '/gsi') { end(404); return }
    if (request.headers.origin || request.headers['sec-fetch-site'] ||
      (json && json !== 'application/json') || request.socket.remoteAddress !== '127.0.0.1') { end(403); return }
    if (Number(request.headers['content-length']) > maxBody) { end(413); request.resume(); return }
    request.setTimeout(4000, () => request.destroy())
    const chunks: Buffer[] = []
    let bytes = 0
    request.on('error', () => end(400))
    request.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > maxBody) {
        end(413)
        request.destroy()
      } else {
        chunks.push(chunk)
      }
    })
    request.on('end', () => {
      if (bytes > maxBody) return
      let value: unknown
      try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown }
      catch { end(400); return }
      const supplied = asRecord(asRecord(value).auth).token
      const actual = typeof supplied === 'string' ? Buffer.from(supplied) : Buffer.alloc(0)
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) { end(401); return }
      onPacket(value)
      end(204)
    })
  })
  server.maxConnections = 10
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve() })
  })
  return { server, port: (server.address() as AddressInfo).port }
}
