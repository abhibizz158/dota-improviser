import type { Kit } from './mechanics.js'
import { RULES, armorReduction, atLevel } from './mechanics.js'
import type { MatchReview } from './model.js'
import type { Timings } from './coach.js'
import { timingTargets } from './coach.js'

export type ItemInfo = {
  n: string; c: number; q: string; a: Record<string, number>; p: string[]
  fx: { t: 'active' | 'passive'; title: string; text: string }[]; cd: number | null; mc: number | null
  attributes?: { key: string; label: string; value: string }[]; cooldown?: string | null; manaCost?: string | null
  /** Neutral item tier (1-5), from Valve's own item data. Undefined for every non-neutral item. */
  neutralTier?: number
}
export type Gear = {
  hp: number; mana: number; armor: number; mr: number; aps: number; dmg: number; ms: number; dps: number; ehp: number; power: number
  physicalHp: number; magicalHp: number; regen: number; manaRegen: number; str: number; agi: number; int: number; evasion: number
}

export const REF_ARMOR = 5
export const canPlan = (item?: ItemInfo) => Boolean(item && item.c > 0 && !item.q.includes('consumable'))
export type TreadsAttribute = 'Strength' | 'Agility' | 'Intelligence'

export function bonuses(items: ItemInfo[], ranged = false, treads: TreadsAttribute = 'Strength') {
  const sum = (...keys: string[]) => items.reduce((total, item) => total + keys.reduce((value, key) => value + (item.a[key] ?? 0), 0), 0)
  const all = sum('bonus_all_stats')
  const flatMove = (item: ItemInfo) => item.a[ranged ? 'bonus_movement_speed_ranged' : 'bonus_movement_speed_melee'] ??
    item.a.bonus_movement_speed ?? item.a.bonus_movement ?? item.a.movement_speed ?? 0
  const boots = items.filter((item) => /boots|treads/i.test(item.n))
  const treadsBonus = items.filter((item) => item.n === 'Power Treads').reduce((total, item) => total + (item.a.bonus_stat ?? 0), 0)
  const multiplyResistance = (...keys: string[]) => 1 - items.reduce((remainder, item) => {
    const value = keys.map((key) => item.a[key]).find((value) => value != null) ?? 0
    return remainder * (1 - Math.min(99, Math.max(0, value)) / 100)
  }, 1)
  return {
    str: sum('bonus_strength', 'bonus_str') + all + (treads === 'Strength' ? treadsBonus : 0),
    agi: sum('bonus_agility', 'bonus_agi') + all + (treads === 'Agility' ? treadsBonus : 0),
    int: sum('bonus_intellect', 'bonus_int') + all + (treads === 'Intelligence' ? treadsBonus : 0),
    hp: sum('bonus_health'), mana: sum('bonus_mana'), armor: sum('bonus_armor'),
    dmg: sum('bonus_damage', ranged ? 'bonus_damage_range' : 'bonus_damage_melee'), aspd: sum('bonus_attack_speed'),
    aspdPct: items.filter((item) => item.n === 'Butterfly').reduce((total, item) => total + (item.a.bonus_attack_speed_pct ?? 0), 0),
    ms: Math.max(0, ...boots.map(flatMove)) + items.filter((item) => !boots.includes(item)).reduce((total, item) => total + flatMove(item), 0),
    msPct: Math.max(0, ...items.map((item) => item.a.movement_speed_percent_bonus ?? 0)),
    regen: sum('bonus_health_regen', 'health_regen', 'hp_regen'), regenAmp: sum('hp_regen_amp'),
    manaRegen: sum('bonus_mana_regen', 'mana_regen'), manaRegenAmp: sum('mana_regen_multiplier'),
    mr: multiplyResistance('bonus_magic_resistance', 'bonus_spell_resist', 'bonus_magical_armor', 'magic_resistance'),
    evasion: multiplyResistance('bonus_evasion'),
  }
}

export function gearAt(kit: Kit, level: number, items: ItemInfo[], treads?: TreadsAttribute, ranged = kit.s.range > 200): Gear {
  const base = atLevel(kit, level)
  const b = bonuses(items, ranged, treads)
  const primary = kit.s.attr === 0 ? b.str : kit.s.attr === 1 ? b.agi : kit.s.attr === 2 ? b.int : RULES.universalDamage * (b.str + b.agi + b.int)
  const hp = base.hp + RULES.hpPerStr * b.str + b.hp
  const armor = base.armor + RULES.armorPerAgi * b.agi + b.armor
  const intelligenceResist = (base.int + b.int) * RULES.magicResistPerInt
  const mr = 1 - (1 - base.mr) * (1 - Math.min(0.95, intelligenceResist)) * (1 - b.mr)
  const speed = (100 + base.agi + b.agi + b.aspd) * (1 + b.aspdPct / 100)
  const aps = Math.min(700, Math.max(20, speed)) / 100 / kit.s.bat
  const dmg = base.dmg + primary * RULES.damagePerPrimary + b.dmg
  const dps = dmg * aps * (1 - armorReduction(REF_ARMOR))
  const physicalHp = hp / ((1 - armorReduction(armor)) * (1 - b.evasion))
  const magicalHp = hp / (1 - mr)
  const ehp = (physicalHp + magicalHp) / 2
  return {
    hp, armor, mr, aps, dmg, dps, ehp, physicalHp, magicalHp, power: dps * ehp, evasion: b.evasion,
    str: base.str + b.str, agi: base.agi + b.agi, int: base.int + b.int,
    mana: base.mana + RULES.manaPerInt * b.int + b.mana,
    ms: Math.min(550, (base.ms + b.ms) * (1 + b.msPct / 100)),
    regen: (base.regen + RULES.hpRegenPerStr * b.str + b.regen) * (1 + b.regenAmp / 100),
    manaRegen: (kit.s.manar + (base.int - kit.s.int + b.int) * RULES.manaRegenPerInt + b.manaRegen) * (1 + b.manaRegenAmp / 100),
  }
}

export function itemEffect(kit: Kit, level: number, owned: ItemInfo[], item: ItemInfo) {
  const before = gearAt(kit, level, owned)
  const after = gearAt(kit, level, [...owned, item])
  const gain = before.power > 0 ? after.power / before.power - 1 : 0
  return { hp: after.hp - before.hp, dps: after.dps - before.dps, ehp: after.ehp - before.ehp, ms: after.ms - before.ms, armor: after.armor - before.armor, mana: after.mana - before.mana, power: gain, perThousand: item.c > 0 ? gain / (item.c / 1000) : 0 }
}

export function levelScaling(kit: Kit, item: ItemInfo, owned: ItemInfo[] = [], levels = Array.from({ length: 30 }, (_, i) => i + 1)) {
  return levels.map((level) => {
    const effect = itemEffect(kit, level, owned, item)
    return { level, power: effect.power, hpPct: effect.hp / gearAt(kit, level, owned).hp }
  })
}

const XP = [0, 240, 640, 1160, 1760, 2440, 3200, 4000, 4900, 5900, 7000, 8200, 9500, 10900, 12400, 14000, 15700, 17500, 19400, 21400, 23600, 26000, 28600, 31400, 34400, 38400, 43400, 49400, 56400, 63900]
export const levelAtXp = (xp: number) => XP.filter((x) => x <= xp).length
export const levelAtMinute = (minute: number, xpm: number) => Math.max(1, Math.min(30, levelAtXp(xpm * minute)))

export function buildCurve(kit: Kit, keys: string[], info: Record<string, ItemInfo>, gpm: number, xpm: number, minutes = 45, treads?: TreadsAttribute, ranged?: boolean) {
  let cumulative = 0
  const buys = keys.flatMap((key) => {
    const item = info[key]
    if (!canPlan(item)) return []
    cumulative += item.c
    return [{ key, t: Math.max(0, (cumulative - 600) / Math.max(1, gpm)), cost: item.c }]
  })
  const points = Array.from({ length: minutes + 1 }, (_, t) => {
    const level = levelAtMinute(t, xpm)
    const owned = buys.filter((buy) => buy.t <= t).map((buy) => info[buy.key])
    return { t, level, ...gearAt(kit, level, owned, treads, ranged), base: gearAt(kit, level, []).power, owned: owned.length }
  })
  return { points, buys }
}

export type ItemHabit = { key: string; games: number; rate: number; avgTime: number; winWith: number | null; winWithout: number | null; nWith: number; nWithout: number; par: number | null; history: { id: string; time: number; won: boolean }[] }
export type ItemAdvice = { level: 'good' | 'warn' | 'info'; kind: 'summary' | 'persist' | 'late' | 'missing' | 'swap'; key?: string; text: string }
export type ItemLearning = { games: number; habits: ItemHabit[]; advice: ItemAdvice[]; usual: string[]; gpm: number | null; xpm: number | null; sync?: { checked: number; failed: number } }
export const emptyItemLearning: ItemLearning = { games: 0, habits: [], advice: [], usual: [], gpm: null, xpm: null }
export const maxPlanItems = 6
const CORE = 1200
const clock = (value: number) => { const t = Math.round(value); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0') }

export type LearnContext = {
  info: Record<string, ItemInfo>
  keyOf: (label: string) => string | undefined
  popular: [string, number][]
  timings?: Timings
}

const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null

export function learnItems(reviews: MatchReview[], account: string, heroId: number, ctx: LearnContext): ItemLearning {
  const recent = [...reviews].sort((a, b) => b.start - a.start)
  const games = recent.flatMap((review) => {
    const player = review.players.find((p) => p.accountId === account && p.heroId === heroId)
    if (!review.parsed || !player || player.won == null || !['All Pick', 'Ranked All Pick'].includes(player.mode)) return []
    if (!(player.purchasesAvailable ?? player.events.some((e) => e.kind === 'item'))) return []
    const first = new Map<string, number>()
    for (const e of player.events) {
      if (e.kind !== 'item' || e.time == null || e.time < -120) continue
      const key = e.key ?? ctx.keyOf(e.label)
      if (!key || !ctx.info[key] || ctx.info[key].c <= 0) continue
      const time = Math.max(0, e.time)
      if (time < (first.get(key) ?? Infinity)) first.set(key, time)
    }
    return [{ id: review.id, won: player.won, first, duration: player.duration, gpm: player.gpm, xpm: player.xpm }]
  }).slice(0, 20)
  if (!games.length) return emptyItemLearning
  const keys = [...new Set(games.flatMap((g) => [...g.first.keys()]))]
  const habits: ItemHabit[] = keys.map((key) => {
    const withItem = games.filter((g) => g.first.has(key))
    const avgTime = average(withItem.map((g) => g.first.get(key)!))!
    const without = games.filter((g) => !g.first.has(key) && g.duration >= avgTime)
    const rate = (rows: typeof games) => average(rows.map((g) => Number(g.won)))
    const timing = timingTargets(ctx.timings?.[key])
    return { key, games: withItem.length, rate: withItem.length / games.length, avgTime,
      winWith: rate(withItem), winWithout: rate(without), nWith: withItem.length, nWithout: without.length, par: timing?.par ?? null,
      history: withItem.toReversed().map((g) => ({ id: g.id, time: g.first.get(key)!, won: g.won })),
    }
  }).sort((a, b) => b.rate - a.rate || a.avgTime - b.avgTime)
  const core = habits.filter((habit) => ctx.info[habit.key].c >= CORE && canPlan(ctx.info[habit.key]))
  const frequent = core.filter((habit) => habit.rate >= 0.6 && habit.games >= 3)
  const usual = core.filter((habit) => habit.rate >= 0.5 && habit.games >= 2).slice(0, maxPlanItems)
    .sort((a, b) => a.avgTime - b.avgTime).map((habit) => habit.key)
  const advice: ItemAdvice[] = []
  for (const habit of frequent.slice(0, 3)) {
    const name = ctx.info[habit.key].n
    const diff = habit.winWith != null && habit.winWithout != null && habit.nWith >= 5 && habit.nWithout >= 5
      ? (habit.winWith - habit.winWithout) * 100 : null
    advice.push({ level: diff != null && diff < -8 ? 'warn' : 'info', kind: 'persist', key: habit.key,
      text: diff != null && diff < -8
        ? `You buy ${name} in ${habit.games} of ${games.length} games. Review losses around the purchase timing and test a situational alternative in similar lineups.`
        : `You buy ${name} in ${habit.games} of ${games.length} games. Use your usual timing as a benchmark when trying a different order.` })
  }
  for (const habit of core.filter((h) => h.par != null && h.games >= 2 && h.avgTime > h.par + 90).slice(0, 2)) {
    advice.push({ level: 'warn', kind: 'late', key: habit.key,
      text: `${ctx.info[habit.key].n} averages ${clock(habit.avgTime)}. The public timing target is ${clock(habit.par!)}. Compare the timing with a cheaper first item or an earlier farm route.` })
  }
  const mine = new Map(habits.map((habit) => [habit.key, habit]))
  if (games.length >= 4) for (const [key] of ctx.popular.filter(([k]) => canPlan(ctx.info[k]) && ctx.info[k].c >= CORE).slice(0, 6)) {
    if ((mine.get(key)?.rate ?? 0) >= 0.25) continue
    advice.push({ level: 'info', kind: 'missing', key, text: `${ctx.info[key].n} appears in public builds for this hero and rarely in yours. Compare its effects with your usual items.` })
    if (advice.filter((entry) => entry.kind === 'missing').length === 2) break
  }
  return { games: games.length, habits, advice, usual,
    gpm: average(games.flatMap((g) => g.gpm != null && g.gpm > 0 ? [g.gpm] : [])),
    xpm: average(games.flatMap((g) => g.xpm != null && g.xpm > 0 ? [g.xpm] : [])),
  }
}
