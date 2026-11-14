import { emptyItemLearning } from '../shared/items'
import { emptyRoshan } from '../shared/roshan'
import type { AppApi, DraftInput, LiveState } from '../shared/model.js'
import { defaultLiveSettings, emptyDraft } from '../shared/model.js'
import { avoid, seedIndex, suggest, teamWinProb } from '../shared/brain.js'
import { buildFor, heroDetailFrom, roleLevels } from '../shared/guide.js'
import { rectify, teamProfile } from '../shared/mechanics.js'
import { buildCorpus, searchCorpus } from '../shared/corpus.js'
import type { ItemInfo } from '../shared/items.js'
import builtInItems from 'virtual:dota-items'
import { webData } from './webdata'
import builtInCatalog from 'virtual:dota-catalog'

export { builtInCatalog }

export const initialLive: LiveState = {
  view: 'lane', interactive: false, draft: emptyDraft, pick: null, coach: null, data: { state: 'idle', done: 0, total: 0, updatedAt: 0, message: '' }, support: null, game: null, toasts: [], career: {},
  status: 'Idle', lane: null, receivedAt: null, open: false, armed: false, pace: [], checkpoints: [], settings: defaultLiveSettings, shortcutAvailable: true, roshan: emptyRoshan,
  recovery: null, awards: {}, assistantShortcutAvailable: false,
  needsSessionInfo: false, sessionInfo: { gameType: null, lane: null }, detectionAvailable: true,
}
let sampleLive = initialLive
const listeners = new Set<(state: LiveState) => void>()
let sampleDraft = { enemy: [] as number[], allied: [] as number[], pool: [] as number[], role: 'Carry' as LiveState['draft']['role'] }
export const browserApi: AppApi = {
  async bootstrap() { return { desktop: false, accountId: '', catalog: builtInCatalog, live: sampleLive, displays: [{ id: 'primary', name: 'Primary display' }], local: { installFound: false, gsiInstalled: false, steamFound: false, build: null, localBuilds: 0 } } },
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
  async setSessionInfo() { return sampleLive },
  async toggleOverlay() { throw new Error('Open the desktop app to show a separate overlay window.') },
  async saveConfig() { throw new Error('Open the desktop app to save a GSI config.') },
  async exportDiagnostics() { throw new Error('Open the desktop app to export diagnostics.') },
  async openExternal(target) {
    const links = { guides: 'https://www.dota2.com/workshop/builds/overview', patches: 'https://www.dota2.com/patches/',
      privacy: 'https://blog.opendota.com/2014/08/01/faq/', gsi: 'https://support.overwolf.com/support/solutions/articles/9000212745-how-to-enable-game-state-integration-for-dota-2',
      personal: 'https://steamcommunity.com/my/gcpd/570/', releases: 'https://github.com/abhibizz158/dota-improviser/releases' }
    if (target === 'screenRecording') return
    window.open(links[target], '_blank', 'noopener,noreferrer')
  },
  async draft(input: DraftInput) {
    sampleDraft = { ...sampleDraft, ...input, role: input.role ?? sampleDraft.role }
    const { seed, db, kits, base, mech } = await webData()
    const levels = roleLevels(kits)
    const brain = { heroes: builtInCatalog.heroes, ...sampleDraft, banned: [] as number[], seed, live: {}, profile: { heroes: {}, pairs: {} }, overrides: {}, stale: false, base, levels, mech }
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
  async requestDraftScreenRecording() { return false },
  async chooseDraftWindow() { return initialLive },
  async learnDraftPortrait() { return 0 },
  async visionDebug() { throw new Error('Open the desktop app to test draft vision.') },
  async detectSteam() { return null },
  async openGame() { throw new Error('Open the desktop app to launch Dota 2.') },
  async importHistory() { throw new Error('Open the desktop app to import matches.') },
  async cachedHistory() { return undefined },
  async sessionHistory() { return [] },
  async parsingMatches() { return [] },
  async puterStatus() { return { connected: false, saved: false, model: 'gpt-5.4-nano' } },
  async puterCancelSignIn() {},
  async copyShareText(text) { await navigator.clipboard.writeText(text) },
  async puterSignIn() { throw new Error('Open the desktop app to connect Puter AI.') },
  async puterSignOut() { return { connected: false, saved: false, model: 'gpt-5.4-nano' } },
  async puterSetModel(model) { return { connected: false, saved: false, model } },
  async roshanStart(which) { sampleLive = { ...sampleLive, roshan: { roshanAt: which !== 'aegis' ? Date.now() : sampleLive.roshan.roshanAt, aegisAt: which !== 'rosh' ? Date.now() : sampleLive.roshan.aegisAt } }; listeners.forEach((fn) => fn(sampleLive)); return sampleLive },
  async roshanClear(which) { sampleLive = { ...sampleLive, roshan: which === 'both' ? emptyRoshan : { ...sampleLive.roshan, aegisAt: null } }; listeners.forEach((fn) => fn(sampleLive)); return sampleLive },
  async searchKnowledge(query) { const { db, kits } = await webData(); return searchCorpus(buildCorpus(builtInCatalog.heroes, kits, db, builtInItems as Record<string, ItemInfo>, []), query, 8) },
  async puterAsk() { throw new Error('Open the desktop app and connect Puter AI to ask a question.') },
  async installConfig() { throw new Error('Open the desktop app to install the GSI config.') },
  async toggleDraftOverlay() { throw new Error('Open the desktop app to show the draft overlay.') },
  async checkUpdates() { return this.updateStatus() },
  async updateStatus() { return { current: 'web', latest: null, state: 'idle', message: '' } },
  async installUpdate() {},
  onUpdate() { return () => {} },
  async toggleAssistant() { return sampleLive },
  async setDeathKiller() { return sampleLive },
  async askLiveCoach() { throw new Error('Open the desktop app and connect Puter AI to ask a question.') },
  onAchievementSound() { return () => {} },
  onLive(fn) { listeners.add(fn); return () => { listeners.delete(fn) } },
}
