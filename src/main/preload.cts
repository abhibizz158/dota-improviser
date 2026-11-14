import { contextBridge, ipcRenderer } from 'electron'
import type { AppApi, LiveState } from '../shared/model.js'

const onLive = (callback: (value: LiveState) => void) => {
  const listener = (_event: unknown, value: LiveState) => callback(value)
  ipcRenderer.on('live:update', listener)
  return () => ipcRenderer.removeListener('live:update', listener)
}

const overlayState = {
  state: () => ipcRenderer.invoke('live:snapshot'),
  height: (value: number) => ipcRenderer.send('overlay:height', value),
  onLive,
}

if (location.hash === '#achievements') {
  contextBridge.exposeInMainWorld('overlayApi', overlayState)
} else if (location.hash === '#overlay') {
  contextBridge.exposeInMainWorld('overlayApi', {
    ...overlayState,
    draft: (input: unknown) => ipcRenderer.invoke('overlay:draft', input),
    done: () => ipcRenderer.invoke('overlay:done'),
    ask: (question: string) => ipcRenderer.invoke('overlay:ask', question),
    sessionInfo: (gameType: string, lane: string) => ipcRenderer.invoke('overlay:session-info', gameType, lane),
    skipSession: () => ipcRenderer.invoke('overlay:skip-session'),
    onAchievementSound: (callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on('achievement:sound', listener)
      return () => ipcRenderer.removeListener('achievement:sound', listener)
    },
  })
} else {
  const api: AppApi = {
    bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
    saveAccount: (id) => ipcRenderer.invoke('profile:save', id),
    history: (id, refresh) => ipcRenderer.invoke('history:get', id, refresh),
    match: (id, refresh) => ipcRenderer.invoke('match:get', id, refresh),
    requestParse: (id) => ipcRenderer.invoke('parse:request', id),
    parseStatus: (id) => ipcRenderer.invoke('parse:status', id),
    matchups: (ids) => ipcRenderer.invoke('draft:matchups', ids),
    build: (id) => ipcRenderer.invoke('draft:build', id),
    clearData: () => ipcRenderer.invoke('app:clear'),
    liveSettings: (settings) => ipcRenderer.invoke('live:settings', settings),
    practice: (enabled) => ipcRenderer.invoke('live:practice', enabled),
    setSessionInfo: (gameType, lane) => ipcRenderer.invoke('live:session-info', gameType, lane),
    toggleOverlay: () => ipcRenderer.invoke('live:toggle'),
    saveConfig: () => ipcRenderer.invoke('live:config'),
    exportDiagnostics: () => ipcRenderer.invoke('live:export'),
    itemLearn: (id, sync) => ipcRenderer.invoke('items:learn', id, sync),
    buildPlan: (id, order) => ipcRenderer.invoke('items:plan', id, order),
    heroGuide: (id) => ipcRenderer.invoke('heroes:guide', id),
    updateData: () => ipcRenderer.invoke('data:update'),
    heroDetail: (id, full) => ipcRenderer.invoke('heroes:detail', id, full),
    draft: (input) => ipcRenderer.invoke('draft:set', input),
    nudge: (mine, enemy, delta) => ipcRenderer.invoke('draft:nudge', mine, enemy, delta),
    defaultBuild: (slug) => ipcRenderer.invoke('draft:default-build', slug),
    requestDraftScreenRecording: () => ipcRenderer.invoke('draft:vision-permission'),
    chooseDraftWindow: () => ipcRenderer.invoke('draft:vision-window'),
    learnDraftPortrait: (slot, hero) => ipcRenderer.invoke('draft:learn-portrait', slot, hero),
    visionDebug: () => ipcRenderer.invoke('draft:vision-debug'),
    detectSteam: () => ipcRenderer.invoke('profile:steam'),
    openGame: () => ipcRenderer.invoke('app:open-game'),
    importHistory: (value) => ipcRenderer.invoke('history:import-local', value),
    cachedHistory: () => ipcRenderer.invoke('history:cached'),
    sessionHistory: () => ipcRenderer.invoke('history:sessions'),
    parsingMatches: () => ipcRenderer.invoke('history:parsing'),
    puterStatus: () => ipcRenderer.invoke('puter:status'),
    puterSignIn: () => ipcRenderer.invoke('puter:sign-in'),
    puterCancelSignIn: () => ipcRenderer.invoke('puter:cancel'),
    copyShareText: (text) => ipcRenderer.invoke('share:copy', text),
    puterSignOut: () => ipcRenderer.invoke('puter:sign-out'),
    puterSetModel: (model) => ipcRenderer.invoke('puter:model', model),
    puterAsk: (question, context) => ipcRenderer.invoke('puter:ask', question, context),
    searchKnowledge: (query) => ipcRenderer.invoke('knowledge:search', query),
    roshanStart: (which) => ipcRenderer.invoke('roshan:start', which),
    roshanClear: (which) => ipcRenderer.invoke('roshan:clear', which),
    installConfig: () => ipcRenderer.invoke('live:install'),
    toggleDraftOverlay: () => ipcRenderer.invoke('live:draft-overlay'),
    checkUpdates: () => ipcRenderer.invoke('app:updates'),
    updateStatus: () => ipcRenderer.invoke('updates:status'),
    installUpdate: () => ipcRenderer.invoke('updates:install'),
    onUpdate: (callback) => {
      const listener = (_event: unknown, status: Awaited<ReturnType<AppApi['updateStatus']>>) => callback(status)
      ipcRenderer.on('updates:changed', listener)
      return () => ipcRenderer.removeListener('updates:changed', listener)
    },
    openExternal: (target) => ipcRenderer.invoke('app:external', target),
    toggleAssistant: () => ipcRenderer.invoke('live:assistant'),
    askLiveCoach: (question) => ipcRenderer.invoke('live:ask', question),
    setDeathKiller: (hero) => ipcRenderer.invoke('live:killer', hero),
    onAchievementSound: (callback) => {
      const listener = () => callback()
      ipcRenderer.on('achievement:sound', listener)
      return () => ipcRenderer.removeListener('achievement:sound', listener)
    },
    onLive,
  }
  contextBridge.exposeInMainWorld('dota', api)
}
