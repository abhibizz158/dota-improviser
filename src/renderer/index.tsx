import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Activity, ArrowDownToLine, ArrowRight, BookOpen, BrainCircuit, CircleHelp, Database, Gamepad2, LayoutDashboard, PanelTop, Radio, Settings2, ShieldCheck, Swords, UserRound } from 'lucide-react'
import type { AppApi, Bootstrap, LiveState, MatchSummary, PuterStatus, SourceResult } from '../shared/model'
import { browserApi, demoCatalog, demoHistory, initialLive } from './demo'
import { Overview } from './overview'
import { CoachCard, Dialog, DraftCard, Feedback, LaneCard, RoshanTimer, Toasts, clock } from './ui'
import { fairPlay } from '../shared/guard'
import '@fontsource-variable/inter/wght.css'
import '@fontsource/barlow-condensed/latin-700.css'
import '@fontsource/barlow-condensed/latin-800.css'
import './styles.css'

declare global {
  interface Window {
    dota?: AppApi
    overlayApi?: { height: (height: number) => void; state: () => Promise<LiveState>; draft: AppApi['draft'] extends (i: infer I) => unknown ? (i: I) => Promise<unknown> : never; onLive: AppApi['onLive'] }
  }
}
const Draft = lazy(() => import('./draft').then((module) => ({ default: module.Draft })))
const LiveSetup = lazy(() => import('./live').then((module) => ({ default: module.LiveSetup })))
const Review = lazy(() => import('./review').then((module) => ({ default: module.Review })))
const Heroes = lazy(() => import('./heroes').then((module) => ({ default: module.Heroes })))
const Know = lazy(() => import('./know').then((module) => ({ default: module.Know })))
const api = window.dota ?? browserApi
const pages = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'draft', label: 'Draft & Builds', icon: Swords },
  { id: 'heroes', label: 'Heroes', icon: Database },
  { id: 'live', label: 'Live & Coach', icon: Radio },
  { id: 'review', label: 'Match Review', icon: Activity },
  { id: 'know', label: 'Know', icon: BookOpen },
] as const
type Page = typeof pages[number]['id']
type Modal = 'account' | 'import' | 'settings' | 'puter' | 'fair' | null

function BrandMark() {
  return <img className="brand-logo" src={import.meta.env.BASE_URL + 'logo.svg'} alt="" width={34} height={34} />
}

function Overlay() {
  const [live, setLive] = useState<LiveState>(initialLive)
  const card = useRef<HTMLDivElement>(null)
  useEffect(() => {
    document.documentElement.classList.add('overlay-document')
    if (!window.overlayApi) return
    let active = true
    let received = false
    const element = card.current
    const observer = new ResizeObserver(() => { if (element) window.overlayApi?.height(element.getBoundingClientRect().height) })
    if (element) observer.observe(element)
    const unsubscribe = window.overlayApi.onLive((state) => { received = true; setLive(state) })
    void window.overlayApi.state().then((state) => { if (active && !received) setLive(state) }).catch(() => {})
    return () => { active = false; observer.disconnect(); unsubscribe() }
  }, [])
  const hero = demoCatalog.heroes.find((hero) => hero.slug === live.lane?.heroSlug)
  return <div className={'overlay-scroll' + (live.interactive ? ' interactive' : '')}><div className="overlay-view" ref={card}>{live.settings.features.toasts && live.view !== 'draft' && <Toasts toasts={live.toasts} />}{live.view === 'draft'
    ? <DraftCard live={live} heroes={demoCatalog.heroes} send={window.overlayApi?.draft} />
    : live.coach ? <CoachCard coach={live.coach} game={live.game} support={live.support} heroes={demoCatalog.heroes} settings={live.settings} heroName={demoCatalog.heroes.find((h) => h.id === live.coach?.heroId)?.name ?? hero?.name ?? 'Hero'} clockText={clock(live.lane?.clock ?? null)} />
      : <LaneCard live={live} hero={hero} />}{live.settings.features.roshanTimer && live.view !== 'draft' && <RoshanTimer roshan={live.roshan} />}</div></div>
}

const demoResult: SourceResult<MatchSummary[]> = { data: demoHistory, updatedAt: 0, stale: false }
const initialContext: Bootstrap = { catalog: demoCatalog, live: initialLive, desktop: Boolean(window.dota), accountId: '', displays: [], local: { installFound: false, gsiInstalled: false, steamFound: false, build: null, localBuilds: 0 } }

function App() {
  const [context, setContext] = useState(initialContext)
  const [live, setLive] = useState(initialLive)
  const [history, setHistory] = useState<SourceResult<MatchSummary[]> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sample, setSample] = useState(true)
  const [page, setPage] = useState<Page>('overview')
  const [selection, setSelection] = useState({ id: '', sample: false })
  const [modal, setModal] = useState<Modal>(null)
  const [input, setInput] = useState('')
  const [formError, setFormError] = useState('')
  const [formBusy, setFormBusy] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [puter, setPuter] = useState<PuterStatus>({ connected: false, saved: false, model: 'gpt-5.4-nano' })
  const [puterModelDraft, setPuterModelDraft] = useState('gpt-5.4-nano')
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
      latestLive.current = value
      if (styleChanged || currentPage.current === 'live' || currentPage.current === 'draft' || currentPage.current === 'heroes' || currentPage.current === 'know') setLive(value)
    })
    void api.bootstrap().then((value) => {
      if (!mounted) return
      setContext(value)
      if (!received) { latestLive.current = value.live; setLive(value.live) }
      if (value.accountId) {
        setSample(false)
        if (value.cachedHistory) setHistory(value.cachedHistory)
        void loadHistory(value.accountId)
      }
    }).catch((reason: Error) => { if (mounted) setError(reason.message) })
    return () => { mounted = false; unsubscribe() }
  }, [])

  useEffect(() => { void api.puterStatus().then((value) => { setPuter(value); setPuterModelDraft(value.model) }).catch(() => {}) }, [])

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
      setModal(null)
      void loadHistory(id, true)
    } catch (reason) { setFormError(reason instanceof Error ? reason.message : 'This account could not be added.') }
    finally { setFormBusy(false) }
  }

  async function detectSteam() {
    const id = await api.detectSteam().catch(() => null)
    if (id) setInput(id); else setFormError('No signed-in Steam user found on this computer.')
  }

  async function updates() {
    const info = await api.checkUpdates()
    setFormError(info.latest ? 'Update ' + info.latest + ' available (you have ' + info.current + ').' : info.configured ? 'Up to date (' + info.current + ').' : 'Updates are not configured: set dotaImproviser.updateRepo in package.json.')
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
          {live.data.state === 'updating' && <span className="data-download" title={'Downloading hero data: ' + live.data.done + ' of ' + live.data.total}>
            <small>Downloading hero data {live.data.done}/{live.data.total}</small>
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
            onOpenGame={() => { void api.openGame().catch((reason: Error) => setError(reason.message)) }} local={context.local} />}
          <Suspense fallback={<p role="status">Loading {pages.find(({ id }) => id === page)?.label}…</p>}>
          {page === 'review' && <Review key={selection.id + ':' + selection.sample} api={api} catalog={context.catalog} account={context.accountId}
            id={selection.id} sample={selection.sample} history={selection.sample ? demoHistory : history?.data ?? []} onImport={() => showModal('import')} onBack={() => navigate('overview')} />}
          {page === 'draft' && <Draft api={api} catalog={context.catalog} sample={sample} live={live} account={context.accountId} onMatch={(id) => openMatch(id, false)} />}
          {page === 'heroes' && <Heroes api={api} live={live} catalog={context.catalog} onDraft={(id) => { void api.draft({ pool: [...new Set([...latestLive.current.draft.pool, id])] }); navigate('draft') }} />}
          {page === 'live' && <LiveSetup api={api} context={context} live={live} onState={setLive} onAccount={() => showModal('account')} />}
          {page === 'know' && <Know api={api} catalog={context.catalog} live={live} puter={puter} />}
          </Suspense>
        </main>
      </div>
    </div>
    {modal && <Dialog title={modal === 'account' ? 'Dota account' : modal === 'import' ? 'Open match by ID' : modal === 'fair' ? 'Fair-play guardrails' : modal === 'puter' ? 'Puter AI connection' : 'Workspace settings'}
      onClose={() => { if (!formBusy) setModal(null) }}>
      {modal === 'fair' ? <div className="settings-dialog"><ul className="fair-list">{fairPlay.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        <p className="fine-print">Enforced in code (network allowlist, fixed GSI sections) and by tests that fail the build on forbidden APIs. Valve's rules can change: this is not legal advice, and you remain responsible for how you use any tool.</p></div> : modal === 'settings' ? <div className="settings-dialog">
        <button className="settings-choice" onClick={() => { setSample(!sample); setModal(null); navigate('overview') }}><PanelTop size={18} /><span><strong>{sample ? 'Open your workspace' : 'Explore sample data'}</strong><small>{sample ? 'Use public match data from your Dota account.' : 'Try the dashboard with example matches.'}</small></span><ArrowRight size={16} /></button>
        <button className="settings-choice" onClick={() => showModal('account')}><UserRound size={18} /><span><strong>Dota account</strong><small>{context.accountId || 'Add a numeric Dota account ID'}</small></span><ArrowRight size={16} /></button>
        <button className="settings-choice" onClick={() => showModal('puter')}><BrainCircuit size={18} /><span><strong>Puter AI</strong><small>{puter.connected ? `Connected · ${puter.model}` : 'Sign in in your browser to request AI coaching'}</small></span><ArrowRight size={16} /></button>
        <button className="settings-choice" onClick={() => void updates()}><ArrowDownToLine size={18} /><span><strong>Check for app updates</strong><small>Game patches are detected automatically from your Dota install.</small></span><ArrowRight size={16} /></button>
        <button className="settings-choice" onClick={() => void api.openExternal('patches')}><ArrowDownToLine size={18} /><span><strong>Official patch notes</strong><small>Open the Dota 2 patch page.</small></span><ArrowRight size={16} /></button>
        <div className="clear-area">
          <p>{confirmClear ? 'Clear this account, cached matches, practice preferences, Puter sign-in, and the local GSI token?' : 'Clear the account and app data stored on this device.'}</p>
          <button className="button danger" disabled={formBusy} onClick={() => void clearData()}>{formBusy ? 'Clearing…' : confirmClear ? 'Confirm clear data' : 'Clear local data'}</button>
        </div>
      </div> : modal === 'puter' ? <div className="settings-dialog puter-settings">
        <p>Puter opens its own browser sign-in. Its AI runs with the account you choose; availability and any free usage limits are set by Puter and may change.</p>
        <div className="puter-connection"><i className={puter.connected ? 'ready' : ''} /><span><strong>{puter.connected ? 'Connected' : 'Not connected'}</strong><small>{puter.connected ? (puter.saved ? 'Encrypted on this device' : 'Session only · secure storage unavailable') : 'No Puter session stored'}</small></span></div>
        <label className="field">Puter model identifier<input value={puterModelDraft} maxLength={80} onChange={(event) => setPuterModelDraft(event.target.value)} placeholder="gpt-5.4-nano" /></label>
        <button className="button secondary" disabled={formBusy || !puterModelDraft.trim()} onClick={() => void savePuterModel()}>Save model choice</button>
        <div className="actions"><button className="button primary" disabled={formBusy} onClick={() => void connectPuter()}>{formBusy ? 'Waiting for browser…' : puter.connected ? 'Switch Puter account' : 'Sign in with Puter'}</button>
          {puter.connected && <button className="button" disabled={formBusy} onClick={() => void disconnectPuter()}>Disconnect</button>}</div>
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
createRoot(document.getElementById('root')!).render(location.hash === '#overlay' ? <Overlay /> : <App />)
