import type { Hero } from './model.js'
import type { HeroDb } from './coach.js'
import type { ItemInfo } from './items.js'
import type { KitsDb } from './mechanics.js'
import { knowledge } from './knowledge.js'

// A small local search index over everything the app already has bundled: every hero's kit (abilities, tagged
// effects), every item (stats, effects, cost), recent Valve patch notes, and the hand-written mechanics glossary.
// This is how the AI coach gets "access to the whole knowledge base" without a vector DB or extra network calls:
// a plain in-memory term match is enough for ~700 short documents and answers in well under a millisecond.
export type CorpusDoc = { id: string; kind: 'hero' | 'item' | 'patch' | 'glossary'; title: string; body: string }

const DAMAGE_WORD: Record<number, string> = { 1: 'physical', 2: 'magical', 4: 'pure' }
const STAT_WORD: Record<string, string> = {
  bonus_strength: 'strength', bonus_agility: 'agility', bonus_intellect: 'intelligence', bonus_all_stats: 'all attributes',
  bonus_health: 'health', bonus_mana: 'mana', bonus_armor: 'armor', bonus_damage: 'damage', bonus_attack_speed: 'attack speed',
  bonus_movement_speed: 'movement speed', bonus_magic_resistance: 'magic resistance', bonus_evasion: 'evasion',
}

function heroDoc(hero: Hero, kits: KitsDb | null, heroDb: HeroDb | null): CorpusDoc {
  const kit = kits?.heroes[hero.id]
  const abilities = kit?.a.map((a) => {
    const tags = [a.u ? 'ultimate' : a.p ? 'passive' : null, DAMAGE_WORD[a.d], a.x ? 'pierces spell immunity' : null, ...a.c].filter(Boolean)
    return `${a.n}${tags.length ? ' (' + tags.join(', ') + ')' : ''}`
  }).join('. ') ?? ''
  const data = heroDb?.heroes[hero.id]
  const items = data ? (['early', 'mid', 'late'] as const).flatMap((phase) => data.items[phase].slice(0, 3).map(([k]) => k)).join(', ') : ''
  return { id: 'hero:' + hero.id, kind: 'hero', title: hero.name, body: [hero.roles.join(', '), abilities, items && 'Popular items: ' + items].filter(Boolean).join('. ') }
}

function itemDoc(key: string, item: ItemInfo): CorpusDoc {
  const stats = Object.entries(item.a).flatMap(([k, v]) => STAT_WORD[k] ? [`+${v} ${STAT_WORD[k]}`] : []).join(', ')
  const effects = item.fx.map((f) => `${f.title}: ${f.text}`).join(' ')
  return { id: 'item:' + key, kind: 'item', title: item.n, body: [item.q + ' item, ' + item.c + ' gold', stats, effects, item.p.length ? 'Built from: ' + item.p.join(', ') : ''].filter(Boolean).join('. ') }
}

// Matches the shape of main/updater.ts's PatchChange, kept structural rather than imported so shared/ code never
// depends on a main-process-only module.
type PatchNote = { patch: string; notes: Record<number, string[]> }

function patchDocs(change: PatchNote, heroes: Hero[]): CorpusDoc[] {
  return Object.entries(change.notes).flatMap(([heroId, notes]) => {
    if (!notes.length) return []
    const hero = heroes.find((h) => h.id === Number(heroId))
    return [{ id: 'patch:' + change.patch + ':' + heroId, kind: 'patch' as const, title: 'Patch ' + change.patch + (hero ? ' — ' + hero.name : ''), body: notes.join('. ') }]
  })
}

export function buildCorpus(heroes: Hero[], kits: KitsDb | null, heroDb: HeroDb | null, items: Record<string, ItemInfo>, patches: PatchNote[]): CorpusDoc[] {
  return [
    ...heroes.map((hero) => heroDoc(hero, kits, heroDb)),
    ...Object.entries(items).map(([key, item]) => itemDoc(key, item)),
    ...patches.flatMap((change) => patchDocs(change, heroes)),
    ...knowledge.map((entry): CorpusDoc => ({ id: 'glossary:' + entry.term, kind: 'glossary', title: entry.term, body: entry.summary + '. ' + entry.detail })),
  ]
}

/** Title matches count far more than body matches, so searching a hero or item name reliably surfaces that hero or item first. */
export function searchCorpus(corpus: CorpusDoc[], query: string, limit = 5): CorpusDoc[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  return corpus.map((doc) => {
    const title = doc.title.toLowerCase(), body = doc.body.toLowerCase()
    const score = words.reduce((sum, word) => sum + (title === word ? 6 : title.includes(word) ? 3 : 0) + (body.includes(word) ? 1 : 0), 0)
    return { doc, score }
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.doc)
}
