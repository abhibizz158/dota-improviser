import { hostAllowed } from '../shared/guard.js'
import { stripTags } from '../shared/guide.js'
import type { DurationRow, HeroGuide, HeroInfo, LaneRow } from '../shared/guide.js'
import type { Store } from './store.js'
import { asRecord, number } from './data.js'

const ATTR = ['Strength', 'Agility', 'Intelligence', 'Universal']
const LANES: LaneRow['lane'][] = ['Safe', 'Mid', 'Off', 'Jungle']
const day = 24 * 3600000

async function getJson(url: string): Promise<unknown> {
  if (!hostAllowed(url)) throw new Error('Blocked by network allowlist.')
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error' })
  if (!res.ok) throw new Error(url + ' returned HTTP ' + res.status)
  return res.json()
}
const list = (v: unknown) => Array.isArray(v) ? v.map(asRecord) : []
const nums = (v: unknown) => Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number').join('/') : ''

/** Valve hero feed + OpenDota lane/duration win rates for one hero. Cached 24h; each source may fail independently. */
export async function loadGuide(store: Store, id: number): Promise<HeroGuide> {
  const key = '/guide/' + id
  const saved = store.cached<HeroGuide>(key)
  if (saved && Date.now() - saved.updatedAt < day) return saved.data
  const [feed, lanes, durations] = await Promise.allSettled([
    getJson('https://www.dota2.com/datafeed/herodata?language=english&hero_id=' + id),
    getJson('https://api.opendota.com/api/scenarios/laneRoles?hero_id=' + id),
    getJson('https://api.opendota.com/api/heroes/' + id + '/durations'),
  ])
  let info: HeroInfo | null = null
  if (feed.status === 'fulfilled') {
    const hero = asRecord(list(asRecord(asRecord(feed.value).result).data && asRecord(asRecord(asRecord(feed.value).result).data).heroes)[0])
    if (Object.keys(hero).length) {
      const n = (k: string) => number(hero[k]) ?? 0
      info = {
        hype: stripTags(hero.hype_loc), bio: stripTags(hero.bio_loc), primary: ATTR[n('primary_attr')] ?? 'Universal', complexity: n('complexity'),
        attackRange: n('attack_range'), moveSpeed: n('movement_speed'), armor: Math.round(n('armor') * 10) / 10, magicResist: n('magic_resistance'),
        health: n('max_health'), mana: n('max_mana'), damage: [n('damage_min'), n('damage_max')], attackRate: n('attack_rate'),
        sightDay: n('sight_range_day'), sightNight: n('sight_range_night'),
        abilities: list(hero.abilities).filter((a) => a.is_item !== true && !a.ability_is_granted_by_scepter && !a.ability_is_granted_by_shard && typeof a.name_loc === 'string' && a.name_loc && stripTags(a.desc_loc))
          .slice(0, 5).map((a) => ({ name: String(a.name_loc), desc: stripTags(a.desc_loc), cooldown: nums(a.cooldowns), mana: nums(a.mana_costs) })),
      }
    }
  }
  const laneMap = new Map<number, { games: number; wins: number }>()
  if (lanes.status === 'fulfilled') for (const r of list(lanes.value)) {
    const role = Number(r.lane_role); const c = laneMap.get(role) ?? { games: 0, wins: 0 }
    c.games += Number(r.games) || 0; c.wins += Number(r.wins) || 0; laneMap.set(role, c)
  }
  const guide: HeroGuide = {
    id, info, patches: [],
    lanes: LANES.flatMap((lane, i) => { const c = laneMap.get(i + 1); return c && c.games ? [{ lane, ...c }] : [] }),
    durations: durations.status === 'fulfilled' ? list(durations.value).map((r): DurationRow => ({ minute: (Number(r.duration_bin) || 0) / 60, games: Number(r.games_played) || 0, wins: Number(r.wins) || 0 })).sort((a, b) => a.minute - b.minute) : [],
  }
  if (info || guide.lanes.length) store.put(key, guide) // never cache a fully failed fetch
  return guide
}
