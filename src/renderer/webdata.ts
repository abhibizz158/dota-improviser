import type { Seed } from '../shared/brain'
import type { HeroDb } from '../shared/coach'
import { baseWinRates } from '../shared/guide'
import { buildMech } from '../shared/mechanics'
import type { KitsDb, MechModel } from '../shared/mechanics'

// Browser preview can load developer-generated data when present. A fresh checkout
// and the desktop build do not require these ignored files.
export type WebData = { seed: Seed | null; db: HeroDb | null; kits: KitsDb | null; base: Record<number, number>; mech: MechModel | null }
let memo: Promise<WebData> | null = null
const generated = import.meta.glob('../../data/{seed,heroes,kits}.json', { import: 'default' })
const load = async <T,>(file: string): Promise<T | null> => {
  try { return (await generated['../../data/' + file]?.() as T | undefined) ?? null }
  catch { return null }
}

export function webData(): Promise<WebData> {
  memo ??= Promise.all([
    load<Seed>('seed.json'),
    load<HeroDb>('heroes.json'),
    load<KitsDb>('kits.json'),
  ]).then(([seed, db, kits]) => { const base = baseWinRates(db); return { seed, db, kits, base, mech: buildMech(kits, seed, base) } })
  return memo
}
