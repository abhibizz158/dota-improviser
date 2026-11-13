import { createRequire } from 'node:module'
import path from 'node:path'
import type { ItemInfo } from '../shared/items.js'
import type { Build, Catalog, Hero, MatchPlayer, MatchReview, MatchSummary, Matchup, ReviewEvent, Role, Timeline } from '../shared/model.js'

const require = createRequire(import.meta.url)
type Raw = Record<string, unknown>
type Constants = {
  heroes: Record<string, { id: number; name: string; localized_name: string; roles: string[]; attack_type?: string }>;
  items: Record<string, { dname?: string; id?: number }>;
  patch: { id: number; name: string; date: string }[];
  game_mode: Record<string, { name: string }>;
  aghs_desc?: { hero_id: number; scepter_desc?: string; scepter_skill_name?: string; shard_desc?: string; shard_skill_name?: string }[];
}
// Load only the tables the app uses. The package entry point parses all bundled datasets.
const constantsRoot = path.join(path.dirname(require.resolve('dotaconstants')), 'build')
const readConstants = <Key extends keyof Constants>(name: Key): Constants[Key] =>
  require(path.join(constantsRoot, name + '.json')) as Constants[Key]
const constants = {
  heroes: readConstants('heroes'), items: readConstants('items'), patch: readConstants('patch'),
  game_mode: readConstants('game_mode'), aghs_desc: readConstants('aghs_desc'),
}
const heroes: Hero[] = Object.values(constants.heroes).map((hero) => ({
  id: hero.id, name: hero.localized_name, slug: hero.name.replace(/^npc_dota_hero_/, ''), roles: hero.roles, ranged: hero.attack_type === 'Ranged',
})).sort((a, b) => a.name.localeCompare(b.name))
const items = Object.fromEntries(Object.entries(constants.items).flatMap(([id, item]) => item.dname ? [[id, item.dname]] : []))
const numberOf = (v: unknown) => { const m = String(v ?? '').match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null }
export const itemInfo: Record<string, ItemInfo> = Object.fromEntries(Object.entries(constants.items as unknown as Record<string, Record<string, unknown>>).flatMap(([key, it]) => {
  const cost = numberOf(it.cost) ?? 0
  if (typeof it.dname !== 'string' || key.startsWith('recipe_')) return []
  const a: Record<string, number> = {}
  const attributes = (Array.isArray(it.attrib) ? it.attrib as { key?: string; value?: unknown; header?: string }[] : []).flatMap((entry) => {
    if (!entry.key || entry.value == null || String(entry.value).trim() === '') return []
    const value = String(entry.value)
    const numeric = /^-?\d+(?:\.\d+)?%?$/.test(value) ? numberOf(value) : null
    if (numeric != null) a[entry.key] = numeric
    return [{ key: entry.key, label: entry.header?.trim() || title(entry.key), value }]
  })
  const fx = (Array.isArray(it.abilities) ? it.abilities as { type?: string; title?: string; description?: string }[] : []).filter((x) => x.title).map((x) => ({ t: x.type === 'active' ? 'active' as const : 'passive' as const, title: String(x.title), text: String(x.description ?? '').replace(/<[^>]+>/g, '') }))
  return [[key, { n: it.dname, c: cost, q: String(it.qual ?? ''), a, attributes, p: Array.isArray(it.components) ? it.components.map(String) : [], fx, cd: numberOf(it.cd), mc: numberOf(it.mc), cooldown: it.cd === false ? null : String(it.cd ?? '') || null, manaCost: it.mc === false ? null : String(it.mc ?? '') || null }]]
}))

const upgrades = Object.fromEntries((constants.aghs_desc ?? []).map((row) => [row.hero_id, {
  scepter: row.scepter_desc ? { name: row.scepter_skill_name ?? 'Scepter upgrade', text: row.scepter_desc.replace(/<[^>]+>/g, '') } : undefined,
  shard: row.shard_desc ? { name: row.shard_skill_name ?? 'Shard upgrade', text: row.shard_desc.replace(/<[^>]+>/g, '') } : undefined,
}]))
export const catalog: Catalog = { heroes, items, upgrades, patch: constants.patch.at(-1)?.name ?? '', patches: constants.patch.map((p) => p.name) }
export const heroById = new Map(heroes.map((hero) => [hero.id, hero]))
export const heroBySlug = new Map(heroes.map((hero) => [hero.slug, hero.id]))
export const itemIds = new Map(Object.entries(constants.items).map(([key, item]) => [item.id, key]))
const patches = new Map(constants.patch.map((patch) => [patch.id, patch.name]))
const steamBase = 76561197960265728n
export const steamId64 = (id: string) => String(steamBase + BigInt(id))

export function asRecord(value: unknown): Raw {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Raw : {}
}

const records = (value: unknown) => Array.isArray(value) ? value.map(asRecord) : []
export const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null
const integer = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) ? value : null

export function accountId(value: unknown) {
  const input = typeof value === 'string' ? value.trim() : ''
  if (!/^\d{1,17}$/.test(input)) throw new Error('Enter a numeric Dota account ID or SteamID64.')
  const id = BigInt(input)
  const converted = input.length === 17 ? id - steamBase : id
  if (converted < 1n || converted >= 4294967295n) throw new Error('This account ID is outside the valid range.')
  return String(converted)
}

export function matchId(value: unknown) {
  const input = typeof value === 'string' ? value.trim() : ''
  if (!/^[1-9]\d{0,15}$/.test(input) || !Number.isSafeInteger(Number(input))) throw new Error('Enter a valid numeric Dota match ID.')
  return input
}

function stringId(value: unknown) {
  return typeof value === 'string' ? value : String(integer(value) ?? '')
}

export function validHero(value: unknown) {
  if (typeof value !== 'number' || !heroById.has(value)) throw new Error('Select a hero from the catalog.')
  return value
}

export function itemName(key: string) {
  return items[key] ?? title(key)
}

function title(key: string) {
  return key.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function mode(gameMode: number | null, lobby: number | null) {
  if (gameMode === 23) return 'Turbo'
  if (gameMode == null || gameMode === 0) return ''
  const name = constants.game_mode[gameMode]?.name
  const formatted = [1, 22].includes(gameMode) ? 'All Pick' : name ? title(name.replace('game_mode_', '')) : ''
  return lobby === 7 && formatted ? 'Ranked ' + formatted : formatted
}

function inferredRole(lane: unknown, position: unknown, roaming: unknown): Role | null {
  if (typeof position === 'number' || (typeof position === 'string' && /^POSITION_[1-5]$/.test(position))) {
    const index = typeof position === 'number' ? position : Number(position.at(-1))
    const role = (['Carry', 'Mid', 'Offlane', 'Soft support', 'Hard support'] as const)[index - 1]
    if (role) return role
  }
  if (lane === 2) return 'Mid'
  if (roaming === true || lane === 4) return 'Soft support'
  return null
}

function patchName(raw: unknown, start: number) {
  const explicit = number(raw)
  if (explicit != null) return patches.get(explicit) ?? ''
  return start > 0 ? constants.patch.findLast((patch) => Date.parse(patch.date) <= start * 1000)?.name ?? '' : ''
}

function summary(raw: Raw, parent: Raw = raw): MatchSummary | null {
  const id = stringId(parent.match_id)
  const heroId = integer(raw.hero_id)
  const slot = integer(raw.player_slot)
  if (!/^[1-9]\d{0,15}$/.test(id) || !heroId || heroId < 1 || slot == null || !((slot >= 0 && slot <= 4) || (slot >= 128 && slot <= 132))) return null
  const radiant = slot < 128
  const start = number(parent.start_time) ?? 0
  return {
    id, heroId, start, duration: number(parent.duration) ?? 0,
    won: typeof parent.radiant_win === 'boolean' ? radiant === parent.radiant_win : null,
    side: radiant ? 'Radiant' : 'Dire',
    kills: number(raw.kills), deaths: number(raw.deaths), assists: number(raw.assists),
    lastHits: number(raw.last_hits), denies: number(raw.denies), gpm: number(raw.gold_per_min), xpm: number(raw.xp_per_min),
    mode: mode(number(parent.game_mode), number(parent.lobby_type)),
    patch: patchName(parent.patch, start),
    role: inferredRole(raw.lane_role, raw.position_est ?? raw.position, raw.is_roaming),
  }
}

export function normalizeHistory(value: unknown) {
  if (!Array.isArray(value)) throw new Error('OpenDota returned an unexpected history response.')
  return records(value).flatMap((row) => summary(row) ?? []).sort((a, b) => b.start - a.start)
}

function labelsForObjectives(parent: Raw): ReviewEvent[] {
  return records(parent.objectives).flatMap((objective) => {
    const type = typeof objective.type === 'string' ? objective.type : ''
    const key = typeof objective.key === 'string' ? objective.key : ''
    const label = key.startsWith('npc_dota_') ? title(key.replace(/^npc_dota_(?:goodguys|badguys)_/, '').replace(/^npc_dota_/, '')) :
      title(type.replace(/^CHAT_MESSAGE_/, ''))
    if (!/(tower|barracks|roshan|aegis|tormentor|firstblood)/i.test(type + ' ' + key)) return []
    return [{ time: number(objective.time), label, kind: 'objective' }]
  })
}

/** Structured objective timeline from OpenDota's parsed replay (post-match only). `team` is the team that OWNED the destroyed building. */
export function buildTimeline(parent: Raw): Timeline {
  const timeline: Timeline = { towers: [], barracks: [], roshan: [], firstBlood: number(parent.first_blood_time), goldAdv: [], xpAdv: [] }
  const side = (key: string) => key.includes('_goodguys_') ? 'Radiant' as const : key.includes('_badguys_') ? 'Dire' as const : null
  const lane = (key: string) => /_top\b/.test(key) ? 'Top' as const : /_mid\b/.test(key) ? 'Mid' as const : /_bot\b/.test(key) ? 'Bot' as const : 'Base' as const
  for (const o of records(parent.objectives)) {
    const type = typeof o.type === 'string' ? o.type : ''
    const key = typeof o.key === 'string' ? o.key : ''
    const time = number(o.time)
    if (time == null) continue
    const team = side(key)
    const tier = key.match(/_tower(\d)/)
    if (type === 'building_kill' && team && tier) timeline.towers.push({ team, tier: Number(tier[1]), lane: lane(key), time })
    else if (type === 'building_kill' && team && /_(melee|range)_rax/.test(key)) timeline.barracks.push({ team, lane: lane(key), kind: key.includes('_melee_') ? 'Melee' : 'Ranged', time })
    else if (/ROSHAN_KILL/.test(type)) timeline.roshan.push(time)
    else if (/FIRSTBLOOD/.test(type) && timeline.firstBlood == null) timeline.firstBlood = time
  }
  const series = (v: unknown) => Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)) : []
  timeline.goldAdv = series(parent.radiant_gold_adv); timeline.xpAdv = series(parent.radiant_xp_adv)
  for (const list of [timeline.towers, timeline.barracks]) list.sort((a, b) => a.time - b.time)
  return timeline
}

function eventList(value: unknown, kind: ReviewEvent['kind'], label: (entry: Raw) => string) {
  return records(value).map((entry) => ({ time: number(entry.time), kind, label: label(entry) }))
}

function heroName(value: unknown) {
  if (typeof value !== 'string') return ''
  return heroes.find((hero) => 'npc_dota_hero_' + hero.slug === value)?.name ?? ''
}

function deathEvents(player: Raw, otherPlayers: Raw[]) {
  if (Array.isArray(player.deaths_log)) {
    return eventList(player.deaths_log, 'death', (entry) => {
      const killer = heroName(entry.key)
      return killer ? 'Death to ' + killer : 'Hero death'
    })
  }
  if (typeof player.hero_id !== 'number') return []
  const hero = heroById.get(player.hero_id)
  if (!hero || otherPlayers.filter((candidate) => candidate.hero_id === player.hero_id).length !== 1) return []
  return otherPlayers.flatMap((opponent) => records(opponent.kills_log)
    .filter((entry) => entry.key === 'npc_dota_hero_' + hero.slug)
    .map((entry): ReviewEvent => ({
      time: number(entry.time), kind: 'death',
      label: 'Death to ' + (typeof opponent.hero_id === 'number' ? heroById.get(opponent.hero_id)?.name ?? 'enemy hero' : 'enemy hero'),
    })))
}

export function normalizeMatch(value: unknown): MatchReview {
  const parent = asRecord(value)
  const id = stringId(parent.match_id)
  const players = records(parent.players)
  if (!id || !players.length || typeof parent.radiant_win !== 'boolean') {
    throw new Error('This completed match is unavailable in OpenDota.')
  }
  const objectives = labelsForObjectives(parent)
  const normalized = players.flatMap((player): MatchPlayer[] => {
    const match = summary(player, parent)
    if (!match) return []
    const deaths = deathEvents(player, players)
    const series = (key: string) => Array.isArray(player[key]) ? player[key] as unknown[] : []
    const times = series('times')
    const gold = series('gold_t')
    const xp = series('xp_t')
    const lastHits = series('lh_t')
    const minutes = times.flatMap((value, index) => {
      const time = number(value)
      if (time == null || time < 0) return []
      const deathsKnown = Array.isArray(player.deaths_log) || (deaths.length > 0 && deaths.length === match.deaths) || match.deaths === 0
      return [{
        time, gold: number(gold[index]), xp: number(xp[index]), lastHits: number(lastHits[index]),
        deaths: deathsKnown ? deaths.filter((death) => death.time != null && death.time <= time).length : null,
      }]
    })
    const account = integer(player.account_id)
    const events = [
      ...records(player.purchase_log).map((entry): ReviewEvent => ({ time: number(entry.time), kind: 'item', label: typeof entry.key === 'string' ? itemName(entry.key) : 'Item purchase', key: typeof entry.key === 'string' ? entry.key : undefined })),
      ...eventList(player.obs_log, 'vision', () => 'Observer ward placed'),
      ...eventList(player.sen_log, 'vision', () => 'Sentry ward placed'),
      ...deaths, ...objectives,
    ].sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity))
    return [{ ...match, minutes: minutes.filter((minute) => [minute.gold, minute.xp, minute.lastHits, minute.deaths].some((value) => value != null)), events, accountId: account != null && account > 0 && account < 4294967295 ? String(account) : null,
      slot: integer(player.player_slot) ?? 0, purchasesAvailable: Array.isArray(player.purchase_log) }]
  })
  if (!normalized.length) throw new Error('This match has no available player statistics.')
  return {
    id, players: normalized, parsed: normalized.some((player) => player.minutes.length || player.events.length),
    start: normalized[0].start, duration: normalized[0].duration, patch: normalized[0].patch, timeline: buildTimeline(parent),
  }
}

export function normalizeMatchups(value: unknown): Matchup[] {
  if (!Array.isArray(value)) throw new Error('OpenDota returned an unexpected matchup response.')
  return records(value).flatMap((row) => {
    const heroId = integer(row.hero_id)
    const games = integer(row.games_played)
    const wins = integer(row.wins)
    return heroId != null && games != null && wins != null && games > 0 && wins >= 0 && wins <= games
      ? [{ heroId, games, wins }] : []
  })
}

export function normalizeBuild(value: unknown): Build {
  if (!Object.keys(asRecord(value)).length) throw new Error('OpenDota has no item usage data for this hero.')
  const stages = (key: string) => Object.entries(asRecord(asRecord(value)[key])).flatMap(([id, value]) => {
    const count = integer(value)
    const entry = itemIds.get(Number(id))
    return count != null && count > 0 && entry ? [{ item: entry, count }] : []
  }).sort((a, b) => b.count - a.count).slice(0, 6)
  return { starting: stages('start_game_items'), early: stages('early_game_items'), mid: stages('mid_game_items'), late: stages('late_game_items') }
}
