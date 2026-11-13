import { emptyItemLearning } from '../shared/items'
import { emptyRoshan } from '../shared/roshan'
import type { AppApi, Build, DraftInput, LiveState, MatchPlayer, MatchSummary, ReviewEvent, SourceResult } from '../shared/model.js'
import { defaultLiveSettings, emptyDraft } from '../shared/model.js'
import { avoid, seedIndex, suggest, teamWinProb } from '../shared/brain.js'
import { buildFor, heroDetailFrom, roleLevels } from '../shared/guide.js'
import { rectify, teamProfile } from '../shared/mechanics.js'
import { buildCorpus, searchCorpus } from '../shared/corpus.js'
import type { ItemInfo } from '../shared/items.js'
import demoItems from 'virtual:dota-items'
import { webData } from './webdata'
import demoCatalog from 'virtual:dota-catalog'

export { demoCatalog }

const recent = [
  [44, true, 'Carry', 12, 3, 10, 698, 758, 276, 16, 2247],
  [8, true, 'Carry', 9, 4, 12, 641, 718, 259, 14, 2072],
  [74, false, 'Mid', 6, 7, 11, 487, 638, 192, 11, 2518],
  [2, true, 'Offlane', 8, 5, 16, 530, 682, 202, 12, 2341],
  [50, false, 'Hard support', 2, 9, 18, 313, 482, 50, 5, 2295],
  [44, true, 'Carry', 13, 4, 8, 677, 727, 265, 17, 2190],
  [13, false, 'Mid', 5, 6, 12, 548, 681, 211, 9, 2398],
  [109, true, 'Carry', 11, 3, 7, 740, 780, 338, 20, 2470],
  [44, true, 'Carry', 10, 2, 9, 678, 714, 282, 20, 2277],
  [8, false, 'Carry', 7, 7, 8, 547, 603, 251, 13, 2409],
  [2, true, 'Offlane', 6, 4, 21, 507, 626, 175, 12, 2513],
  [74, true, 'Mid', 9, 4, 15, 598, 755, 224, 15, 2279],
  [44, false, 'Carry', 8, 8, 11, 571, 601, 230, 12, 2361],
  [50, true, 'Hard support', 3, 5, 22, 321, 509, 64, 3, 2227],
  [8, true, 'Carry', 12, 3, 9, 679, 725, 277, 16, 2206],
  [2, false, 'Offlane', 5, 8, 14, 487, 632, 173, 10, 2485],
  [13, true, 'Mid', 11, 4, 16, 590, 699, 215, 12, 2345],
  [44, false, 'Carry', 7, 6, 5, 559, 609, 227, 10, 2199],
  [8, true, 'Carry', 10, 4, 9, 644, 698, 237, 13, 2167],
  [109, false, 'Carry', 6, 6, 7, 639, 700, 293, 12, 2490],
  [50, false, 'Hard support', 1, 8, 13, 285, 411, 36, 4, 2107],
  [74, true, 'Mid', 7, 4, 17, 566, 635, 190, 15, 2324],
  [2, true, 'Offlane', 9, 4, 15, 534, 624, 192, 13, 2247],
  [13, false, 'Mid', 4, 7, 8, 432, 568, 172, 11, 2015],
  [44, true, 'Carry', 10, 3, 11, 651, 709, 262, 16, 2113],
] as const

export const demoHistory: MatchSummary[] = recent.map((row, index) => {
  const [heroId, won, role, kills, deaths, assists, gpm, xpm, lastHits, denies, duration] = row
  return {
    id: String(9000000025 - index), heroId, won, role, kills, deaths, assists, gpm, xpm, lastHits, denies, duration,
    start: Date.UTC(2026, 10, 12, 15) / 1000 - index * 32400,
    mode: index === 20 ? 'Turbo' : 'Ranked All Pick',
    patch: index < 22 ? demoCatalog.patch : '7.40', side: index % 3 === 1 ? 'Dire' : 'Radiant',
  }
})

export function demoReview(match: MatchSummary): MatchPlayer {
  const duration = Math.floor(match.duration / 60)
  const seed = Number(match.id.slice(-2))
  const deathTimes = Array.from({ length: match.deaths ?? 0 }, (_, index) => (index + 1) * 217 + seed * 3)
    .filter((time) => time < match.duration)
  return {
    ...match, slot: 0, accountId: null,
    minutes: Array.from({ length: duration + 1 }, (_, index) => {
      const time = index * 60
      const progress = index / duration
      return {
        time, gold: Math.round(progress * (match.gpm ?? 0) * duration + 600 + Math.sin(index) * 98),
        xp: Math.round(progress ** 1.2 * (match.xpm ?? 0) * duration),
        lastHits: Math.round(progress ** 1.2 * (match.lastHits ?? 0) + Math.sin(index / 2) * 3),
        deaths: deathTimes.filter((death) => death <= time).length,
      }
    }),
    events: ([
      { time: -18, kind: 'item', label: 'Quelling Blade' },
      { time: 302 + seed * 3, kind: 'item', label: 'Power Treads' },
      { time: 752 + seed * 3, kind: 'item', label: 'Battle Fury' },
      { time: 935 + seed * 3, kind: 'item', label: 'Desolator' },
      { time: 1293 + seed * 3, kind: 'item', label: 'Black King Bar' },
      { time: 194, kind: 'vision', label: 'Observer ward placed' },
      { time: 976, kind: 'objective', label: 'Tier 1 tower destroyed' },
      { time: 1483, kind: 'objective', label: 'Roshan slain' },
      ...deathTimes.map((time) => ({ time, label: 'Hero death', kind: 'death' as const })),
    ] satisfies ReviewEvent[]).sort((a, b) => a.time - b.time),
  }
}

const sourced = <T,>(data: T): SourceResult<T> => ({ data, updatedAt: Date.now(), stale: false })
export const initialLive: LiveState = {
  view: 'lane', interactive: false, draft: emptyDraft, pick: null, coach: null, data: { state: 'idle', done: 0, total: 0, updatedAt: 0, message: '' }, support: null, game: null, toasts: [], career: {},
  status: 'Idle', lane: null, receivedAt: null, open: false, armed: false, pace: [], checkpoints: [], settings: defaultLiveSettings, shortcutAvailable: true, roshan: emptyRoshan,
  recovery: null, awards: {}, assistantShortcutAvailable: false,
  needsSessionInfo: false, sessionInfo: { gameType: null, lane: null },
}
let sampleLive = initialLive
const listeners = new Set<(state: LiveState) => void>()
let sampleDraft = { enemy: [] as number[], allied: [] as number[], pool: [] as number[], role: 'Carry' as LiveState['draft']['role'] }
const buildExample: Build = {
  starting: [{ item: 'tango', count: 4838 }, { item: 'quelling_blade', count: 4562 }, { item: 'branches', count: 3919 }, { item: 'circlet', count: 2010 }],
  early: [{ item: 'power_treads', count: 4317 }, { item: 'magic_wand', count: 3310 }, { item: 'wraith_band', count: 1872 }],
  mid: [{ item: 'bfury', count: 3258 }, { item: 'desolator', count: 2742 }, { item: 'black_king_bar', count: 2010 }],
  late: [{ item: 'satanic', count: 831 }, { item: 'abyssal_blade', count: 740 }, { item: 'butterfly', count: 483 }],
}

export const browserApi: AppApi = {
  async bootstrap() { return { desktop: false, accountId: '', catalog: demoCatalog, live: sampleLive, displays: [{ id: 'primary', name: 'Primary display' }], local: { installFound: false, gsiInstalled: false, steamFound: false, build: null, localBuilds: 0 } } },
  async saveAccount() { throw new Error('Open the desktop app to load a Dota account.') },
  async history() { throw new Error('Open the desktop app to load match history.') },
  async match() { throw new Error('Open the desktop app to load a match by ID.') },
  async requestParse() { throw new Error('Open the desktop app to request a replay parse.') },
  async parseStatus() { return { jobId: '', pending: false } },
  async matchups() { throw new Error('Open the desktop app to fetch current matchup data.') },
  async build() { throw new Error('Open the desktop app to fetch item usage data.') },
  async clearData() { sampleLive = initialLive; return this.bootstrap() },
  async liveSettings(settings) { sampleLive = { ...sampleLive, settings }; return sampleLive },
  async practice() { throw new Error('Open the desktop app to connect Game State Integration.') },
  async toggleOverlay() { throw new Error('Open the desktop app to show a separate overlay window.') },
  async saveConfig() { throw new Error('Open the desktop app to save a GSI config.') },
  async exportDiagnostics() { throw new Error('Open the desktop app to export diagnostics.') },
  async openExternal(target) {
    const links = { guides: 'https://www.dota2.com/workshop/builds/overview', patches: 'https://www.dota2.com/patches/',
      privacy: 'https://blog.opendota.com/2014/08/01/faq/', gsi: 'https://support.overwolf.com/support/solutions/articles/9000212745-how-to-enable-game-state-integration-for-dota-2',
      personal: 'https://steamcommunity.com/my/gcpd/570/', releases: 'https://github.com/abhibizz158/dota-improviser/releases', updateToken: 'https://github.com/settings/personal-access-tokens/new' }
    window.open(links[target], '_blank', 'noopener,noreferrer')
  },
  async draft(input: DraftInput) {
    sampleDraft = { ...sampleDraft, ...input, role: input.role ?? sampleDraft.role }
    const { seed, db, kits, base, mech } = await webData()
    const levels = roleLevels(kits)
    const brain = { heroes: demoCatalog.heroes, ...sampleDraft, banned: [] as number[], seed, live: {}, profile: { heroes: {}, pairs: {} }, overrides: {}, stale: false, base, levels, mech }
    const has = sampleDraft.enemy.length || sampleDraft.allied.length || sampleDraft.pool.length
    sampleLive = { ...sampleLive, draft: { ...emptyDraft, ...sampleDraft, stale: false, seedPatch: seed?.patch ?? '',
      teamWin: sampleDraft.enemy.length && sampleDraft.allied.length ? teamWinProb(sampleDraft.allied, sampleDraft.enemy, seedIndex(seed), base, mech?.k) : null,
      suggestions: has ? suggest(brain, 8).map((s) => ({ ...s, build: buildFor(db?.heroes[s.heroId]) })) : [], avoid: avoid(brain, 3),
      analysis: (() => { const e = teamProfile(sampleDraft.enemy, kits), a = teamProfile(sampleDraft.allied, kits); return { enemy: e, ally: a, fixes: rectify(e, a), model: mech ? { r2: mech.r2, samples: mech.samples, importance: mech.importance } : null } })() } }
    listeners.forEach((fn) => fn(sampleLive))
    return sampleLive
  },
  async nudge() { return sampleLive },
  async updateData() { return sampleLive },
  async itemLearn() { return emptyItemLearning },
  async buildPlan(id, order) {
    const key = 'dota-build-plan:' + id
    if (order) sessionStorage.setItem(key, JSON.stringify(order))
    return JSON.parse(sessionStorage.getItem(key) ?? '[]') as string[]
  },
  async heroGuide(id: number) { return { id, info: null, lanes: [], durations: [], patches: [] } },
  async heroDetail(id: number, full = true) { const { seed, db, kits, base, mech } = await webData(); return heroDetailFrom(id, seedIndex(seed), db, base, kits, full ? mech : null) },
  async defaultBuild() { return null },
  async detectSteam() { return null },
  async openGame() { throw new Error('Open the desktop app to launch Dota 2.') },
  async importHistory() { throw new Error('Open the desktop app to import matches.') },
  async cachedHistory() { return undefined },
  async sessionHistory() { return [] },
  async puterStatus() { return { connected: false, saved: false, model: 'gpt-5.4-nano' } },
  async puterSignIn() { throw new Error('Open the desktop app to connect Puter AI.') },
  async puterSignOut() { return { connected: false, saved: false, model: 'gpt-5.4-nano' } },
  async puterSetModel(model) { return { connected: false, saved: false, model } },
  async roshanStart(which) { sampleLive = { ...sampleLive, roshan: { roshanAt: which !== 'aegis' ? Date.now() : sampleLive.roshan.roshanAt, aegisAt: which !== 'rosh' ? Date.now() : sampleLive.roshan.aegisAt } }; listeners.forEach((fn) => fn(sampleLive)); return sampleLive },
  async roshanClear(which) { sampleLive = { ...sampleLive, roshan: which === 'both' ? emptyRoshan : { ...sampleLive.roshan, aegisAt: null } }; listeners.forEach((fn) => fn(sampleLive)); return sampleLive },
  async searchKnowledge(query) { const { db, kits } = await webData(); return searchCorpus(buildCorpus(demoCatalog.heroes, kits, db, demoItems as Record<string, ItemInfo>, []), query, 8) },
  async puterAsk() { throw new Error('Open the desktop app and connect Puter AI to ask a question.') },
  async installConfig() { throw new Error('Open the desktop app to install the GSI config.') },
  async toggleDraftOverlay() { throw new Error('Open the desktop app to show the draft overlay.') },
  async checkUpdates() { return this.updateStatus() },
  async updateStatus() { return { current: 'web', latest: null, connected: false, state: 'idle', message: '' } },
  async connectUpdates() { throw new Error('Open the desktop app to connect GitHub.') },
  async disconnectUpdates() { return this.updateStatus() },
  async installUpdate() {},
  onUpdate() { return () => {} },
  async toggleAssistant() { return sampleLive },
  async askLiveCoach() { throw new Error('Open the desktop app and connect Puter AI to ask a question.') },
  onAchievementSound() { return () => {} },
  onLive(fn) { listeners.add(fn); return () => { listeners.delete(fn) } },
}

export function demoMatchups(enemy: number[]) {
  return sourced(Object.fromEntries(enemy.map((opponent) => [opponent, demoCatalog.heroes.map((hero) => {
    const games = 280 + (hero.id * 83 + opponent * 123) % 1750
    const winRate = 0.45 + ((hero.id * 67 + opponent * 31) % 25) / 250
    return { heroId: hero.id, games, wins: Math.round(games * winRate) }
  })])))
}

export const demoBuild = () => sourced(buildExample)
