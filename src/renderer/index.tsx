import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Activity, ArrowDownToLine, ArrowRight, Award, BookOpen, BrainCircuit, CircleHelp, Database, Gamepad2, LayoutDashboard, PanelTop, Radio, Settings2, ShieldCheck, Swords, UserRound } from 'lucide-react'
import type { AppApi, Bootstrap, FeatureKey, LiveState, MatchSummary, PuterStatus, SourceResult, UpdateInfo } from '../shared/model'
import { featureInfo } from '../shared/model'
import { browserApi, demoCatalog, demoHistory, initialLive } from './demo'
import { Overview } from './overview'
import { AssistantCard, CoachCard, Dialog, DraftCard, Feedback, LaneCard, RecoveryCard, RoshanTimer, SessionPrompt, Toasts, clock } from './ui'
import { fairPlay } from '../shared/guard'
import { playAchievementChime } from './sound'
import '@fontsource-variable/inter/wght.css'
import '@fontsource/barlow-condensed/latin-700.css'
import '@fontsource/barlow-condensed/latin-800.css'
import './styles.css'

declare global {
  interface Window {
    dota?: AppApi
    overlayApi?: { height: (height: number) => void; state: () => Promise<LiveState>; draft: AppApi['draft'] extends (i: infer I) => unknown ? (i: I) => Promise<unknown> : never; done: () => Promise<void>; ask: (question: string) => Promise<string>; sessionInfo: (gameType: string, lane: string) => Promise<unknown>; onAchievementSound: (callback: () => void) => () => void; onLive: AppApi['onLive'] }
  }
}
const Draft = lazy(() => import('./draft').then((module) => ({ default: module.Draft })))
const LiveSetup = lazy(() => import('./live').then((module) => ({ default: module.LiveSetup })))
const Review = lazy(() => import('./review').then((module) => ({ default: module.Review })))
const Heroes = lazy(() => import('./heroes').then((module) => ({ default: module.Heroes })))
const Know = lazy(() => import('./know').then((module) => ({ default: module.Know })))
const Achievements = lazy(() => import('./achievements').then((module) => ({ default: module.Achievements })))
const api = window.dota ?? browserApi
const pages = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'draft', label: 'Draft & Builds', icon: Swords },
  { id: 'heroes', label: 'Heroes', icon: Database },
  { id: 'live', label: 'Live & Coach', icon: Radio },
  { id: 'achievements', label: 'Achievements', icon: Award },
  { id: 'review', label: 'Match Review', icon: Activity },
  { id: 'know', label: 'Know', icon: BookOpen },
] as const
type Page = typeof pages[number]['id']
type Modal = 'account' | 'import' | 'settings' | 'puter' | 'fair' | 'updates' | 'privateHistory' | 'welcome' | null

const onboardedKey = 'dota-improviser-onboarded'
function readOnboarded() { try { return localStorage.getItem(onboardedKey) === '1' } catch { return true } }
function markOnboarded() { try { localStorage.setItem(onboardedKey, '1') } catch { /* ignore */ } }

function BrandMark() {
  return <img className="brand-logo" src={import.meta.env.BASE_URL + 'logo.svg'} alt="" width={34} height={34} />
}

/** Shared by every overlay window: subscribes to live state over the preload bridge and reports this window's
 * measured content height back to the main process so it can size/place the native BrowserWindow to match. */
function useOverlayLive(playSound: boolean) {
  const [live, setLive] = useState<LiveState>(initialLive)
  const card = useRef<HTMLDivElement>(null)
  useEffect(() => {
    document.documentElement.classList.add('overlay-document')
    if (!window.overlayApi) return
    let active = true
    let received = false
    const element = card.current
    let lastHeight = 0
    const observer = new ResizeObserver(([entry]) => {
      const height = Math.ceil(entry.borderBoxSize[0]?.blockSize ?? element?.offsetHeight ?? 0)
      if (height > 0 && height !== lastHeight) { lastHeight = height; window.overlayApi?.height(height) }
    })
    if (element) observer.observe(element)
    const unsubscribe = window.overlayApi.onLive((state) => { received = true; setLive(state) })
    void window.overlayApi.state().then((state) => { if (active && !received) setLive(state) }).catch(() => {})
    const stopSound = playSound ? window.overlayApi.onAchievementSound(playAchievementChime) : undefined
    return () => { active = false; observer.disconnect(); unsubscribe(); stopSound?.() }
  }, [playSound])
  return { live, card }
}

function Overlay() {
  const { live, card } = useOverlayLive(true)
  const hero = demoCatalog.heroes.find((hero) => hero.slug === live.lane?.heroSlug)
  const compact = live.settings.size === 'Compact'
  const editorial = live.view !== 'draft' && live.view !== 'assistant'
  return <div className={'overlay-scroll' + (live.interactive ? ' interactive' : '')}><div className="overlay-view" ref={card}>
    {live.needsSessionInfo
      ? <SessionPrompt onSubmit={(gameType, lane) => window.overlayApi?.sessionInfo(gameType, lane) ?? Promise.resolve()} />
      : live.view === 'assistant'
      ? <AssistantCard ask={window.overlayApi?.ask} done={window.overlayApi?.done} />
      : live.view === 'draft'
      ? <DraftCard live={live} heroes={demoCatalog.heroes} send={window.overlayApi?.draft} done={window.overlayApi?.done} />
      : live.coach ? <CoachCard coach={live.coach} game={live.game} support={live.support} heroes={demoCatalog.heroes} settings={live.settings} compact={compact} heroName={demoCatalog.heroes.find((h) => h.id === live.coach?.heroId)?.name ?? hero?.name ?? 'Hero'} clockText={clock(live.lane?.clock ?? null)} />
        : <LaneCard live={live} hero={hero} />}
    {live.settings.features.deathAdvice && live.recovery && editorial && <RecoveryCard recovery={live.recovery} />}
    {live.settings.features.roshanTimer && editorial && <RoshanTimer roshan={live.roshan} />}
    {!compact && live.settings.features.toasts && editorial && <Toasts toasts={live.toasts.filter((t) => t.kind === 'alert')} />}
  </div></div>
}

/** Mirror-corner window for achievement pop-ups (first blood, multikills, streaks, item/milestone goals) — kept
 * out of the main card entirely so a burst of trophies never covers the stats it's celebrating. */
function AchievementOverlay() {
  const { live, card } = useOverlayLive(false)
  return <div className="overlay-scroll"><div className="overlay-view achievement-view" ref={card}>
    <Toasts toasts={live.toasts.filter((t) => t.kind !== 'alert')} />
  </div></div>
}

const demoResult: SourceResult<MatchSummary[]> = { data: demoHistory, updatedAt: 0, stale: false }
const initialContext: Bootstrap = { catalog: demoCatalog, live: initialLive, desktop: Boolean(window.dota), accountId: '', displays: [], local: { installFound: false, gsiInstalled: false, steamFound: false, build: null, localBuilds: 0 } }

function App() {
  const [context, setContext] = useState(initialContext)
  const [live, setLive] = useState(initialLive)
  const [history, setHistory] = useState<SourceResult<MatchSummary[]> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sample, setSample] = useState(false)
  const [page, setPage] = useState<Page>('overview')
  const [selection, setSelection] = useState({ id: '', sample: false })
  const [modal, setModal] = useState<Modal>(null)
  const [welcomeStep, setWelcomeStep] = useState(0)
  const [gsiMessage, setGsiMessage] = useState({ message: '', error: false })
  const [gsiBusy, setGsiBusy] = useState(false)
  const [input, setInput] = useState('')
  const [formError, setFormError] = useState('')
  const [formBusy, setFormBusy] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [puter, setPuter] = useState<PuterStatus>({ connected: false, saved: false, model: 'gpt-5.4-nano' })
  const [puterModelDraft, setPuterModelDraft] = useState('gpt-5.4-nano')
  const [appUpdate, setAppUpdate] = useState<UpdateInfo | null>(null)
  const [privateRows, setPrivateRows] = useState('')
  const request = useRef(0)
  const currentPage = useRef<Page>('overview')
  const latestLive = useRef(initialLive)

  async function loadHistory(id: string, refresh = false) {
    const current = ++request.current
    setError('')
    setLoading(true)
    try {
      const data = await api.history(id, refresh)
      if (current === request.current) setHistory(data)
    } catch (reason) {
      if (current === request.current) setError(reason instanceof Error ? reason.message : 'Unable to load your history.')
    } finally {
      if (current === request.current) setLoading(false)
    }
  }

  useEffect(() => {
    let mounted = true
    let received = false
    const unsubscribe = api.onLive((value) => {
      received = true
      const styleChanged = value.settings.features.styleProfile !== latestLive.current.settings.features.styleProfile
      const downloadChanged = value.data.state !== latestLive.current.data.state || value.data.done !== latestLive.current.data.done
      if (value.historyChangedAt && value.historyChangedAt !== latestLive.current.historyChangedAt) {
        const pending = request.current
        void api.cachedHistory().then((saved) => { if (saved && mounted && pending === request.current) setHistory(saved) }).catch(() => {})
      }
      latestLive.current = value
      if (styleChanged || downloadChanged || currentPage.current === 'live' || currentPage.current === 'draft' || currentPage.current === 'heroes' || currentPage.current === 'know' || currentPage.current === 'achievements') setLive(value)
    })
    void api.bootstrap().then((value) => {
      if (!mounted) return
      setContext(value)
      if (!received) { latestLive.current = value.live; setLive(value.live) }
      if (value.accountId) {
        markOnboarded()
        if (value.cachedHistory) setHistory(value.cachedHistory)
        // An empty cached result could just mean nothing was fetched after public match data was turned on
        // (the 30-minute cache can't tell "truly empty" from "not asked yet") — always force a live check then.
        void loadHistory(value.accountId, !value.cachedHistory?.data.length)
      } else if (!readOnboarded()) {
        setWelcomeStep(0)
        setModal('welcome')
      }
    }).catch((reason: Error) => { if (mounted) setError(reason.message) })
    return () => { mounted = false; unsubscribe() }
  }, [])

  useEffect(() => { void api.puterStatus().then((value) => { setPuter(value); setPuterModelDraft(value.model) }).catch(() => {}) }, [])
  useEffect(() => api.onAchievementSound(playAchievementChime), [])
  useEffect(() => {
    let eventReceived = false
    const unsubscribe = api.onUpdate((info) => { eventReceived = true; setAppUpdate(info) })
    void api.updateStatus().then((info) => { if (!eventReceived) setAppUpdate(info) }).catch(() => {})
    return unsubscribe
  }, [])

  function navigate(next: Page) {
    currentPage.current = next
    setLive(latestLive.current)
    setPage(next)
    document.querySelector('.content-scroll')?.scrollTo({ top: 0 })
  }

  function showModal(next: Modal) {
    setInput(next === 'account' ? context.accountId : '')
    setFormError('')
    setConfirmClear(false)
    if (next === 'privateHistory') setPrivateRows('')
    setModal(next)
  }

  function openMatch(id: string, isSample: boolean) {
    setSelection({ id, sample: isSample })
    navigate('review')
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setFormError('')
    const value = input.trim()
    if (modal === 'import') {
      if (!/^[1-9]\d{0,15}$/.test(value) || !Number.isSafeInteger(Number(value))) { setFormError('Enter a valid numeric Dota match ID.'); return }
      setModal(null)
      openMatch(value, false)
      return
    }
    if (!/^\d{1,17}$/.test(value)) { setFormError('Enter a numeric Dota account ID or SteamID64.'); return }
    setFormBusy(true)
    try {
      const id = await api.saveAccount(value)
      setContext((value) => ({ ...value, accountId: id }))
      setHistory(null)
      setSelection({ id: '', sample: false })
      setSample(false)
      markOnboarded()
      if (modal === 'welcome') setWelcomeStep(1); else setModal(null)
      void loadHistory(id, true)
    } catch (reason) { setFormError(reason instanceof Error ? reason.message : 'This account could not be added.') }
    finally { setFormBusy(false) }
  }

  async function detectSteam() {
    const id = await api.detectSteam().catch(() => null)
    if (id) setInput(id); else setFormError('No signed-in Steam user found on this computer.')
  }

  async function installGsiNow() {
    setGsiBusy(true); setGsiMessage({ message: '', error: false })
    try { setGsiMessage({ message: await api.installConfig(), error: false }) }
    catch (error) { setGsiMessage({ message: error instanceof Error ? error.message : 'Could not install the config.', error: true }) }
    finally { setGsiBusy(false) }
  }

  async function saveGsiNow() {
    setGsiBusy(true); setGsiMessage({ message: '', error: false })
    try { setGsiMessage({ message: (await api.saveConfig()) ? 'Config saved. Restart Dota after installing it.' : '', error: false }) }
    catch (error) { setGsiMessage({ message: error instanceof Error ? error.message : 'Could not save the config.', error: true }) }
    finally { setGsiBusy(false) }
  }

  async function toggleFeature(key: FeatureKey, value: boolean) {
    setLive(await api.liveSettings({ ...live.settings, features: { ...live.settings.features, [key]: value } }))
  }

  async function updateAction(action: 'check' | 'install') {
    setFormError(''); setFormBusy(true)
    try {
      if (action === 'install') await api.installUpdate()
      else setAppUpdate(await api.checkUpdates())
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Update action failed.') }
    finally { setFormBusy(false) }
  }

  async function importPrivateHistory() {
    setFormError(''); setFormBusy(true)
    try {
      const result = await api.importHistory(privateRows)
      ++request.current
      setHistory(result); setLoading(false); setSample(false); setError(''); setModal(null); navigate('overview')
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Could not import matches.') }
    finally { setFormBusy(false) }
  }

  async function connectPuter() {
    setFormError(''); setFormBusy(true)
    try { const status = await api.puterSignIn(); setPuter(status); setPuterModelDraft(status.model) }
    catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Puter sign-in did not complete.') }
    finally { setFormBusy(false) }
  }

  async function disconnectPuter() {
    setFormError(''); setFormBusy(true)
    try { setPuter(await api.puterSignOut()) }
    catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Could not disconnect Puter.') }
    finally { setFormBusy(false) }
  }

  async function savePuterModel() {
    setFormError(''); setFormBusy(true)
    try { setPuter(await api.puterSetModel(puterModelDraft)) }
    catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Could not save the model.') }
    finally { setFormBusy(false) }
  }

  async function clearData() {
    if (!confirmClear) { setConfirmClear(true); return }
    setFormBusy(true)
    ++request.current
    try {
      const fresh = await api.clearData()
      setPuter({ connected: false, saved: false, model: 'gpt-5.4-nano' }); setPuterModelDraft('gpt-5.4-nano')
      setContext(fresh)
      latestLive.current = fresh.live
      setLive(fresh.live)
      setHistory(null)
      setSample(true)
      setSelection({ id: '', sample: false })
      setError('')
      setLoading(false)
      setModal(null)
      navigate('overview')
    } catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Local data could not be cleared.') }
    finally { setFormBusy(false) }
  }

  const rows = sample ? demoResult : history
  const statusText = sample ? 'Sample workspace' : context.accountId ? 'Account ' + context.accountId : 'Local workspace'

  return <div className={'shell ' + (context.desktop ? 'desktop' + (/Mac/.test(navigator.platform) ? ' mac' : '') : '')}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="sidebar">
      <div className="brand"><BrandMark /><div><strong>DOTA</strong><strong>IMPROVISER</strong></div></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav aria-label="Main navigation">
        {pages.map(({ id, label, icon: Icon }) => <button key={id} className={'nav-button ' + (page === id ? 'active' : '')}
          aria-label={label} aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={18} /><span>{label}</span>{page === id && <i />}</button>)}
      </nav>
      <div className="sidebar-bottom">
        <button className="practice-status" onClick={() => showModal('fair')} aria-label="Fair-play guardrails"><ShieldCheck size={17} /><div><strong>Fair-play guardrails</strong><small>Own-client data only</small></div></button>
        <button className="nav-button" aria-label="Settings" onClick={() => showModal('settings')}><Settings2 size={18} /><span>Settings</span></button>
        <div className="sidebar-profile">
          <span className="profile-icon"><UserRound size={17} /></span>
          <div><strong>{context.accountId && !sample ? 'Dota player' : 'Local profile'}</strong><small>{sample ? 'Sample data' : context.accountId ? 'Account connected' : 'Account optional'}</small></div>
          <button className="icon-button" aria-label="Open account settings" onClick={() => showModal('account')}><CircleHelp size={17} /></button>
        </div>
      </div>
    </aside>
    <div className="main-shell">
      <header className="topbar">
        <div className="breadcrumb"><Gamepad2 size={17} /><span>Workspace</span><span className="slash">/</span><strong>{pages.find(({ id }) => id === page)?.label}</strong></div>
        <div className="topbar-actions">
          {appUpdate?.state === 'ready' && <button className="button secondary slim" onClick={() => showModal('updates')}>Update ready</button>}
          {live.data.state === 'updating' && <span className="data-download" title={'Downloading hero data: ' + live.data.done + ' of ' + live.data.total}>
            <small>Downloading hero data{live.data.total > 0 ? ` ${live.data.done}/${live.data.total}` : '…'}</small>
            <div className="data-download-bar"><i style={{ width: (live.data.total ? 100 * live.data.done / live.data.total : 0) + '%' }} /></div></span>}
          <button className={'status-pill ' + (sample ? 'sample' : 'connected')} title={sample ? 'Switch to your workspace' : 'Workspace settings'} onClick={() => sample ? setSample(false) : showModal('settings')}>
            <i />{statusText}</button>
          <button className="icon-button top-settings" aria-label="Settings" onClick={() => showModal('settings')}><Settings2 size={18} /></button>
        </div>
      </header>
      <div className="content-scroll">
        <main key={page} className="content" id="main-content" tabIndex={-1}>
          {!sample && <Feedback message={error} error />}
          {page === 'overview' && <Overview api={api} showStyle={live.settings.features.styleProfile} onUseHero={(id) => { void api.draft({ pool: [...new Set([...latestLive.current.draft.pool, id])] }); navigate('draft') }} catalog={context.catalog} account={context.accountId} loading={loading} demo={sample} history={rows}
            onAccount={() => showModal('account')} onRefresh={() => { setSample(false); void loadHistory(context.accountId, true) }}
            onMatch={(id) => openMatch(id, sample)} onImport={() => showModal('import')} onDraft={() => navigate('draft')}
            onPrivateHistory={() => showModal('privateHistory')} onOpenGame={() => { setError(''); void api.openGame().catch((reason: Error) => setError(reason.message)) }} local={context.local} />}
          <Suspense fallback={<p role="status">Loading {pages.find(({ id }) => id === page)?.label}…</p>}>
          {page === 'review' && <Review key={selection.id + ':' + selection.sample} api={api} catalog={context.catalog} account={context.accountId}
            id={selection.id} sample={selection.sample} history={selection.sample ? demoHistory : history?.data ?? []} onImport={() => showModal('import')} onBack={() => navigate('overview')} />}
          {page === 'draft' && <Draft api={api} catalog={context.catalog} sample={sample} live={live} account={context.accountId} onMatch={(id) => openMatch(id, false)} />}
          {page === 'heroes' && <Heroes api={api} live={live} catalog={context.catalog} onDraft={(id) => { void api.draft({ pool: [...new Set([...latestLive.current.draft.pool, id])] }); navigate('draft') }} />}
          {page === 'achievements' && <Achievements catalog={context.catalog} live={live} />}
          {page === 'live' && <LiveSetup api={api} context={context} live={live} onState={setLive} onAccount={() => showModal('account')} />}
          {page === 'know' && <Know api={api} catalog={context.catalog} live={live} puter={puter} />}
          </Suspense>
        </main>
      </div>
    </div>
    {modal && <Dialog title={modal === 'account' ? 'Dota account' : modal === 'import' ? 'Open match by ID' : modal === 'fair' ? 'Fair-play guardrails' : modal === 'puter' ? 'Puter AI connection' : modal === 'updates' ? 'App updates' : modal === 'privateHistory' ? 'Import your own matches' : modal === 'welcome' ? 'Set up Dota Improviser' : 'Workspace settings'}
      onClose={() => { if (!formBusy) { markOnboarded(); setModal(null) } }}>
      {modal === 'welcome' ? <div className="settings-dialog welcome-dialog">
        <div className="wizard-steps"><span className={welcomeStep === 0 ? 'active' : ''}>1. Account</span><span className={welcomeStep === 1 ? 'active' : ''}>2. Live feed</span><span className={welcomeStep === 2 ? 'active' : ''}>3. AI coach</span><span className={welcomeStep === 3 ? 'active' : ''}>4. Features</span></div>
        {welcomeStep === 0 && <>
          <p>This app is local-first: everything stays on this device except public OpenDota/Valve lookups and whatever your own Dota account already shares publicly. Link your account now to load match history, or skip and add it later from Settings.</p>
          <form onSubmit={(event) => void submit(event)}>
            <label className="field">Dota account ID or SteamID64<input autoFocus inputMode="numeric" autoComplete="off" maxLength={17} value={input} onChange={(event) => setInput(event.target.value)} placeholder="e.g. 86745912" /></label>
            <Feedback message={formError} error />
            <div className="actions">
              <button className="button primary" type="submit" disabled={formBusy || !input.trim() || !context.desktop}>{formBusy ? 'Saving…' : 'Load match history'} <ArrowRight size={16} /></button>
              {context.local.steamFound && <button className="text-button" type="button" onClick={() => void detectSteam()}>Use my Steam account</button>}
            </div>
          </form>
          <p className="fine-print">Match history needs Dota's own "Expose Public Match Data" setting on (Dota Settings → General). OpenDota can take a few minutes to notice after you turn it on.</p>
        </>}
        {welcomeStep === 1 && <>
          <p>The live overlay, draft card and achievements need Dota's Game State Integration (GSI) — a local config file, opt-in and read-only. Skip this if you only want match history and draft planning.</p>
          <ol className="setup-steps">
            <li><div><strong>Install the config</strong><p>{context.local.gsiInstalled ? 'Already installed.' : context.local.installFound ? 'One click into your local Dota install.' : 'Local Dota install not found on this device — use "Save as…" and copy the file in by hand.'}</p></div>
              <span className="inline-actions">{context.local.installFound && <button className="button secondary slim" disabled={gsiBusy} onClick={() => void installGsiNow()}>{gsiBusy ? 'Installing…' : context.local.gsiInstalled ? 'Reinstall' : 'Install'}</button>}
              <button className="button secondary slim" disabled={gsiBusy || !context.desktop} onClick={() => void saveGsiNow()}>Save as…</button></span></li>
            <li><div><strong>Add the launch option</strong><p>In Steam, right-click Dota 2 → Properties → Launch Options, add <code>-gamestateintegration</code>, then restart Dota.</p></div></li>
          </ol>
          <Feedback {...gsiMessage} />
          <p className="fine-print">{/Mac/.test(navigator.platform) ? 'macOS only asks for Screen Recording permission if you turn on Draft vision later in this setup — the overlay and GSI feed need no OS permission at all.' : 'Windows needs no special permission for the overlay or GSI feed; some antivirus tools flag a new local listener on first run, which is safe to allow.'}</p>
        </>}
        {welcomeStep === 2 && <>
          <p>Optional: sign in with Puter to ask an AI coach about your draft or practice game. Puter opens its own browser sign-in; the AI only ever receives your question, the selected hero/picks/items, and derived facts this app already computed — never your Steam ID or match history.</p>
          <div className="puter-connection"><i className={puter.connected || puter.saved ? 'ready' : ''} /><span><strong>{puter.connected ? 'Connected' : puter.saved ? 'Saved sign-in' : 'Not connected'}</strong><small>{puter.saved ? 'Encrypted on this device. The system may ask to unlock it after an update.' : puter.connected ? 'Session only' : 'No Puter session stored'}</small></span></div>
          <div className="actions"><button className="button primary" disabled={formBusy} onClick={() => void connectPuter()}>{formBusy ? 'Waiting for browser…' : puter.connected ? 'Switch Puter account' : 'Sign in with Puter'}</button>
            {(puter.connected || puter.saved) && <button className="button" disabled={formBusy} onClick={() => void disconnectPuter()}>Disconnect</button>}</div>
          <Feedback message={formError} error />
          <p className="fine-print">Skip this if you don't want AI coaching — everything else in the app works without it, and you can connect it later from Settings → Puter AI.</p>
        </>}
        {welcomeStep === 3 && <>
          <p>Everything below is off until you choose it. Draft vision is the only feature that ever reads your screen, and only the pick-bar strip during hero selection — never once a match is live.</p>
          <label className="check-field"><input type="checkbox" checked={live.settings.features.draftVision} onChange={(event) => void toggleFeature('draftVision', event.target.checked)} /><span>{featureInfo.draftVision.label}<small>{featureInfo.draftVision.help}</small></span></label>
          <label className="check-field"><input type="checkbox" checked={live.settings.features.toasts} onChange={(event) => void toggleFeature('toasts', event.target.checked)} /><span>{featureInfo.toasts.label}<small>{featureInfo.toasts.help}</small></span></label>
          <p className="fine-print">"Save my completed match stats locally" lives on Live &amp; Coach once the listener is running — it records your own finished games automatically, nothing made public. Change any of this any time from Live &amp; Coach → Features, or Settings here.</p>
        </>}
        <div className="actions">
          {welcomeStep > 0 && <button className="button secondary" onClick={() => setWelcomeStep((step) => step - 1)}>Back</button>}
          {welcomeStep < 3 && <button className="button secondary" onClick={() => setWelcomeStep((step) => step + 1)}>Next</button>}
          {welcomeStep === 3 && <button className="button primary" onClick={() => { markOnboarded(); setModal(null) }}>Finish</button>}
          <button className="text-button" onClick={() => { markOnboarded(); setModal(null) }}>Skip setup</button>
        </div>
      </div> : modal === 'fair' ? <div className="settings-dialog"><ul className="fair-list">{fairPlay.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        <p className="fine-print">Enforced in code (network allowlist, fixed GSI sections) and by tests that fail the build on forbidden APIs. Valve's rules can change: this is not legal advice, and you remain responsible for how you use any tool.</p></div> : modal === 'settings' ? <div className="settings-dialog">
        <button className="settings-choice" onClick={() => { setWelcomeStep(0); setModal('welcome') }}><UserRound size={18} /><span><strong>Setup guide</strong><small>Account, live feed and feature setup, step by step</small></span><ArrowRight size={16} /></button>
        <button className="settings-choice" onClick={() => { setSample(!sample); setModal(null); navigate('overview') }}><PanelTop size={18} /><span><strong>{sample ? 'Open your workspace' : 'Explore sample data'}</strong><small>{sample ? 'Use public match data from your Dota account.' : 'Try the dashboard with example matches.'}</small></span><ArrowRight size={16} /></button>
        <button className="settings-choice" onClick={() => showModal('account')}><UserRound size={18} /><span><strong>Dota account</strong><small>{context.accountId || 'Add a numeric Dota account ID'}</small></span><ArrowRight size={16} /></button>
        <button className="settings-choice" onClick={() => showModal('puter')}><BrainCircuit size={18} /><span><strong>Puter AI</strong><small>{puter.connected ? `Connected · ${puter.model}` : 'Sign in in your browser to request AI coaching'}</small></span><ArrowRight size={16} /></button>
        <button className="settings-choice" onClick={() => showModal('updates')}><ArrowDownToLine size={18} /><span><strong>App updates</strong><small>{appUpdate?.state === 'ready' ? 'An update is ready to install' : 'Connect to private GitHub releases'}</small></span><ArrowRight size={16} /></button>
        <button className="settings-choice" disabled={!context.accountId} onClick={() => showModal('privateHistory')}><Database size={18} /><span><strong>Matches without public sharing</strong><small>Auto-capture via the listener, or a manual backfill</small></span><ArrowRight size={16} /></button>
        <button className="settings-choice" onClick={() => void api.openExternal('patches')}><ArrowDownToLine size={18} /><span><strong>Official patch notes</strong><small>Open the Dota 2 patch page.</small></span><ArrowRight size={16} /></button>
        <div className="clear-area">
          <p>{confirmClear ? 'Clear this account, cached matches, practice preferences, Puter sign-in, and the local GSI token?' : 'Clear the account and app data stored on this device.'}</p>
          <button className="button danger" disabled={formBusy} onClick={() => void clearData()}>{formBusy ? 'Clearing…' : confirmClear ? 'Confirm clear data' : 'Clear local data'}</button>
        </div>
      </div> : modal === 'updates' ? <div className="settings-dialog">
        <p>Installed version: {appUpdate?.current ?? '—'}. The repository is public, so the app checks every six hours with no setup needed, and downloads verified updates in the background. Installation opens your OS installer and closes the app.</p>
        <div className="actions">
          <button className="button secondary" disabled={formBusy || (appUpdate != null && ['checking', 'downloading'].includes(appUpdate.state))} onClick={() => void updateAction('check')}>Check now</button>
          {appUpdate?.state === 'ready' && <button className="button primary" disabled={formBusy} onClick={() => void updateAction('install')}>Install {appUpdate.latest}</button>}
        </div>
        <button className="text-button" onClick={() => void api.openExternal('releases')}>Open GitHub releases</button>
        <Feedback error={appUpdate?.state === 'error' || Boolean(formError)} message={formError || appUpdate?.message || (appUpdate?.state === 'checking' ? 'Checking GitHub…' : appUpdate?.state === 'downloading' ? 'Downloading and verifying the installer…' : appUpdate?.state === 'current' ? 'You have the latest compatible build.' : '')} />
      </div> : modal === 'privateHistory' ? <div className="settings-dialog">
        <p className="feedback"><b>Best option: skip typing matches in altogether.</b> Start the practice listener on Live &amp; Coach and turn on "Save my completed match stats locally" — it records your own finished games here automatically, straight from Dota, with no Steam setting to change and nothing made public. It only needs Dota open with the listener running when a game ends.</p>
        <p>There is no Valve or Steam export that hands you a downloadable file of your own match history without turning on "Expose Public Match Data" in Dota's settings (which also makes it visible to public tools like OpenDota). Steam's personal game data page below is a page you read, not a file you can download or paste from — so for games the listener missed, you'd be copying numbers off that page by hand into the rows below. Up to 20 rows, kept only on this device.</p>
        <button className="text-button" onClick={() => void api.openExternal('personal')}>Open Steam personal game data</button>
        <label className="field">Completed match rows<textarea rows={6} maxLength={16000} value={privateRows} onChange={(event) => setPrivateRows(event.target.value)} placeholder={'match_id,hero,side,result,date,duration,kills,deaths,assists,gpm,xpm,last_hits,denies\n8123456789,Axe,Radiant,Win,2026-01-20,2100,8,4,15,510,630,160,12'} /></label>
        <p className="fine-print">Use hero name or ID, Radiant or Dire, Win or Loss, YYYY-MM-DD, and duration in seconds. Leave unavailable stats blank.</p>
        <Feedback message={formError} error />
        <button className="button primary" disabled={formBusy || !privateRows.trim()} onClick={() => void importPrivateHistory()}>Import into Overview</button>
      </div> : modal === 'puter' ? <div className="settings-dialog puter-settings">
        <p>Puter opens its own browser sign-in. Its AI runs with the account you choose; availability and any free usage limits are set by Puter and may change.</p>
        <div className="puter-connection"><i className={puter.connected || puter.saved ? 'ready' : ''} /><span><strong>{puter.connected ? 'Connected' : puter.saved ? 'Saved sign-in' : 'Not connected'}</strong><small>{puter.saved ? 'Encrypted on this device. The system may ask to unlock it after an update.' : puter.connected ? 'Session only' : 'No Puter session stored'}</small></span></div>
        <label className="field">Puter model identifier<input value={puterModelDraft} maxLength={80} onChange={(event) => setPuterModelDraft(event.target.value)} placeholder="gpt-5.4-nano" /></label>
        <button className="button secondary" disabled={formBusy || !puterModelDraft.trim()} onClick={() => void savePuterModel()}>Save model choice</button>
        <div className="actions"><button className="button primary" disabled={formBusy} onClick={() => void connectPuter()}>{formBusy ? 'Waiting for browser…' : puter.connected ? 'Switch Puter account' : 'Sign in with Puter'}</button>
          {(puter.connected || puter.saved) && <button className="button" disabled={formBusy} onClick={() => void disconnectPuter()}>Disconnect</button>}</div>
        <p className="fine-print">AI requests send your question and the selected hero/picks/items plus optional own-player practice clock, GPM and unspent gold. Steam ID and match history are not sent. Sign out clears the encrypted local token.</p>
        <Feedback message={formError} error />
      </div> : <form onSubmit={(event) => void submit(event)} className="modal-form">
        <p>{modal === 'account' ? 'Use your Dota friend ID or SteamID64. Public match coverage depends on Dota’s Expose Public Match Data setting.' : 'Enter the numeric ID of a completed Dota 2 match.'}</p>
        <label className="field">{modal === 'account' ? 'Dota account ID or SteamID64' : 'Match ID'}
          <input autoFocus inputMode="numeric" autoComplete="off" maxLength={17} value={input} onChange={(event) => setInput(event.target.value)}
            placeholder={modal === 'account' ? 'e.g. 86745912' : 'e.g. 9087439951'} /></label>
        <Feedback message={formError} error />
        <div className="actions">
          <button className="button primary" type="submit" disabled={formBusy || !input.trim() || !context.desktop}>{formBusy ? 'Saving…' : modal === 'account' ? 'Load match history' : 'Open match'} <ArrowRight size={16} /></button>
          {modal === 'account' && context.local.steamFound && <button className="text-button" type="button" onClick={() => void detectSteam()}>Use my Steam account</button>}
          {modal === 'account' && <button className="text-button" type="button" onClick={() => void api.openExternal('privacy')}>Match data privacy</button>}
        </div>
        {!context.desktop && <p className="fine-print">Account and match imports are available in the desktop app.</p>}
      </form>}
      {modal === 'settings' && <Feedback message={formError} />}
    </Dialog>}
  </div>
}

if (window.dota) document.documentElement.classList.add(navigator.userAgent.includes('Mac') ? 'mac' : 'win')
createRoot(document.getElementById('root')!).render(
  location.hash === '#overlay' ? <Overlay /> : location.hash === '#achievements' ? <AchievementOverlay /> : <App />)
