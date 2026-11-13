import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'
register(new URL('./ts-resolve.mjs', import.meta.url))
const { buildCorpus, searchCorpus } = await import('../src/shared/corpus.ts')

const heroes = [{ id: 1, slug: 'axe', name: 'Axe', roles: ['Initiator', 'Durable'] }, { id: 2, slug: 'lina', name: 'Lina', roles: ['Carry', 'Nuker'] }]
const kits = { builtAt: 1, heroes: {
  1: { s: {}, r: [], a: [{ n: "Berserker's Call", u: false, p: false, d: 0, x: true, c: ['taunt'], m: 0 }, { n: 'Culling Blade', u: true, p: false, d: 4, x: true, c: [], m: 0 }] },
  2: { s: {}, r: [], a: [{ n: 'Laguna Blade', u: true, p: false, d: 2, x: false, c: [], m: 0 }] },
} }
const heroDb = { builtAt: 1, patch: '7', percentiles: [], heroes: { 1: { pick: [], win: [], pro: [0, 0, 0], turbo: [0, 0], bench: {}, items: { starting: [], early: [['blink', 9]], mid: [], late: [] } } } }
const items = { blink: { n: 'Blink Dagger', c: 2250, q: 'common', a: {}, p: [], fx: [{ t: 'active', title: 'Blink', text: 'Teleports a short distance.' }], cd: 12, mc: null } }
const patches = [{ patch: '7.42', notes: { 1: ['Berserker\'s Call cooldown reduced.'] } }]

test('builds one doc per hero, item and patch note, plus the glossary', () => {
  const corpus = buildCorpus(heroes, kits, heroDb, items, patches)
  assert.ok(corpus.some((d) => d.id === 'hero:1' && d.title === 'Axe'))
  assert.ok(corpus.some((d) => d.id === 'item:blink' && d.title === 'Blink Dagger'))
  assert.ok(corpus.some((d) => d.id === 'patch:7.42:1'))
  assert.ok(corpus.some((d) => d.kind === 'glossary'))
  assert.equal(corpus.filter((d) => d.kind === 'patch').length, 1) // hero 2 has no notes this patch, no empty doc
})

test('hero docs describe tagged ability effects, damage type and BKB-piercing', () => {
  const doc = buildCorpus(heroes, kits, null, {}, []).find((d) => d.id === 'hero:1')
  assert.match(doc.body, /taunt/)
  assert.match(doc.body, /pierces spell immunity/)
  assert.match(doc.body, /ultimate/)
  assert.match(doc.body, /pure/)
})

test('item docs describe stats, cost and effect text', () => {
  const doc = buildCorpus([], null, null, items, []).find((d) => d.id === 'item:blink')
  assert.match(doc.body, /2250 gold/)
  assert.match(doc.body, /Teleports a short distance/)
})

test('search ranks an exact title match above a body-only mention, and is case-insensitive', () => {
  const corpus = buildCorpus(heroes, kits, heroDb, items, patches)
  const results = searchCorpus(corpus, 'axe')
  assert.equal(results[0].title, 'Axe')
  const byId = searchCorpus(corpus, 'AXE').map((d) => d.id)
  assert.deepEqual(byId, searchCorpus(corpus, 'axe').map((d) => d.id))
})

test('search respects the limit and returns nothing for an empty or unmatched query', () => {
  const corpus = buildCorpus(heroes, kits, heroDb, items, patches)
  assert.equal(searchCorpus(corpus, '', 5).length, 0)
  assert.equal(searchCorpus(corpus, 'zzz_no_such_term').length, 0)
  assert.ok(searchCorpus(corpus, 'e', 3).length <= 3) // common letter matches many docs; limit still holds
})
