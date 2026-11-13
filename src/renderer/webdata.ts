import type { Seed } from '../shared/brain'
import type { HeroDb } from '../shared/coach'
import { baseWinRates } from '../shared/guide'
import { buildMech } from '../shared/mechanics'
import type { KitsDb, MechModel } from '../shared/mechanics'

// Browser preview (no desktop app): load the same bundled hero data the desktop app ships, so numbers are real, not placeholders.
// Dynamic imports keep these JSON files out of the main bundle; the desktop app never loads them.
export type WebData = { seed: Seed | null; db: HeroDb | null; kits: KitsDb | null; base: Record<number, number>; mech: MechModel | null }
let memo: Promise<WebData> | null = null
const load = async <T,>(importer: () => Promise<{ default: unknown }>): Promise<T | null> => { try { return (await importer()).default as T } catch { return null } }

export function webData(): Promise<WebData> {
  memo ??= Promise.all([
    load<Seed>(() => import('../../data/seed.json')),
    load<HeroDb>(() => import('../../data/heroes.json')),
    load<KitsDb>(() => import('../../data/kits.json')),
  ]).then(([seed, db, kits]) => { const base = baseWinRates(db); return { seed, db, kits, base, mech: buildMech(kits, seed, base) } })
  return memo
}
