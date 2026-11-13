// data/kits.json: every hero's base stats, Valve role levels and tagged abilities from dota2.com/datafeed/herodata.
// Status tags are inferred from the ability text; damage type (1 physical, 2 magical, 4 pure), spell-immunity piercing
// (immunity 3 = pierces, 4 = blocked) and ultimates (type 1) come straight from Valve's fields.
// KEEP the patterns in sync with STATUS_RE in src/shared/mechanics.ts (a test compares them).
import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
const constants = createRequire(import.meta.url)('dotaconstants')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const STATUS_RE = {
  stun: '\\bstun|\\bdisabling\\b', silence: '\\bsilenc|\\b(prevent|stop)s? [^.]{0,40}\\bcasting\\b|\\bcan(no|\')t cast\\b|\\bunable to cast\\b',
  mute: '\\bmut(e|ed|es|ing)\\b|\\b(disables?|prevent|stops?)[^.]{0,30}\\bitems?\\b', root: '\\broot(s|ed|ing)?\\b|\\bensnar|\\bentangl|\\bimmobiliz',
  hex: '\\bhex(es|ed)?\\b|\\bturns?\\b[^.]{0,30}\\binto a\\b|\\bpolymorph', disarm: '\\bdisarm|\\bcan(no|\')t attack\\b|\\bprevent(s)?[^.]{0,30}\\battack(ing)?\\b',
  slow: '\\bslow(s|ed|ing)?\\b', fear: '\\bfear|\\bterrif|\\bflee|\\brun(s)? away\\b', taunt: '\\btaunt|\\bforc(es|ing)[^.]{0,40}\\battack\\b',
  sleep: '\\bsleep|\\bput(s)?[^.]{0,20}to sleep', knockback: '\\bknock(s|ed|ing)?\\b|\\bdrag(s|ging)?\\b|\\bpull(s|ing)?\\b|\\bpush(es|ing)?\\b|\\bhurl|\\bdisplace|\\bforced movement|\\bcyclone|\\bsuck',
  blind: '\\bblind|\\bmiss chance|\\bchance to miss\\b', break: '\\bbreak(s)? passive|\\bpassive abilities?[^.]{0,30}(disabled|break)|\\bbreaks?\\b[^.]{0,20}\\bpassive',
  invis: '\\binvisib', heal: '\\bheals?\\b|\\bhealing\\b|\\blifesteal|\\blife steal', dispel: '\\bdispel|\\bpurge|\\bremoves? [^.]{0,30}(debuffs|buffs|negative)',
  barrier: '\\bbarrier|\\bshield|\\babsorbs?\\b|\\bblocks?\\b[^.]{0,20}\\bdamage', evasion: '\\bevasion|\\bdodge',
}
const RES = Object.entries(STATUS_RE).map(([k, v]) => [k, new RegExp(v, 'i')])
const clean = (t) => String(t ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const heroes = {}
for (const { id } of Object.values(constants.heroes)) {
  const res = await fetch(`https://www.dota2.com/datafeed/herodata?language=english&hero_id=${id}`, { signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`hero ${id}: HTTP ${res.status}`)
  const h = (await res.json()).result?.data?.heroes?.[0]
  if (!h) continue
  const abilities = (h.abilities ?? []).filter((a) => a.name_loc && !a.is_item && !a.ability_is_granted_by_scepter && !a.ability_is_granted_by_shard && clean(a.desc_loc)).slice(0, 6).map((a) => {
    const text = clean(a.desc_loc) + ' ' + clean(Array.isArray(a.notes_loc) ? a.notes_loc.join(' ') : a.notes_loc)
    const beh = BigInt(a.behavior ?? 0)
    return { n: a.name_loc, u: a.type === 1, p: (beh & 2n) === 2n, d: [1, 2, 4].includes(a.damage) ? a.damage : 0, x: a.immunity === 3, c: RES.filter(([, re]) => re.test(text)).map(([k]) => k), m: Array.isArray(a.mana_costs) ? a.mana_costs[0] ?? 0 : 0 }
  })
  heroes[id] = {
    s: { str: h.str_base, strg: h.str_gain, agi: h.agi_base, agig: h.agi_gain, int: h.int_base, intg: h.int_gain, attr: h.primary_attr, hp: h.max_health, hpr: h.health_regen, mana: h.max_mana, manar: h.mana_regen,
      dmin: h.damage_min, dmax: h.damage_max, bat: h.attack_rate, range: h.attack_range, proj: h.projectile_speed, armor: h.armor, mr: h.magic_resistance, ms: h.movement_speed, turn: h.turn_rate, sight: h.sight_range_day, night: h.sight_range_night, cx: h.complexity },
    r: h.role_levels, a: abilities,
  }
  process.stdout.write('.'); await wait(450)
}
await writeFile('data/kits.json', JSON.stringify({ builtAt: Date.now(), heroes }))
console.log(`\nkits.json: ${Object.keys(heroes).length} heroes`)
