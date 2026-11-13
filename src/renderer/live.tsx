import { useState } from 'react'
import { ArrowUpRight, CheckCircle2, CircleHelp, Download, FileDown, Layers3, Monitor, Radio, Shield, ShieldCheck } from 'lucide-react'
import type { AppApi, Bootstrap, FeatureKey, LiveSettings, LiveState, Placement } from '../shared/model'
import { featureInfo, featureKeys, roles } from '../shared/model'
import { CoachCard, Feedback, LaneCard, RoshanTimer, clock } from './ui'

type Props = { api: AppApi; context: Bootstrap; live: LiveState; onState: (live: LiveState) => void; onAccount: () => void }
const positions: Placement[] = ['Top left', 'Top right', 'Bottom left', 'Bottom right']

const trophyName = (id: string) => id === 'first-blood' ? 'First Blood' : id.startsWith('multi-') ? id.slice(6) : id.startsWith('streak-') ? ({ '3': 'Killing Spree', '4': 'Dominating', '5': 'Mega Kill', '6': 'Unstoppable', '7': 'Wicked Sick', '8': 'Monster Kill', '9': 'Godlike', '10': 'Beyond Godlike' } as Record<string, string>)[id.slice(7)] ?? id
  : id === 'no-death-10' ? 'Untouched at 10:00' : id === 'cs-60' ? '60 last hits by 10:00' : id.startsWith('goal-') ? 'Goal: ' + id.slice(5).replaceAll('_', ' ') : id
const trophyRank = (id: string) => id.includes('Rampage') ? 0 : id.includes('Ultra') ? 1 : id.includes('Triple') ? 2 : id.includes('Double') ? 3 : id === 'first-blood' ? 4 : 5

/** Career trophy case: every achievement your own game feed has recorded on this device. */
function Trophies({ career }: { career: Record<string, number> }) {
  const rows = Object.entries(career).sort((a, b) => trophyRank(a[0]) - trophyRank(b[0]) || b[1] - a[1])
  return <section className="panel form-panel reveal">
    <header className="panel-heading"><div><h2>Trophy case</h2><p>Achievements recorded from your own games on this device</p></div></header>
    {rows.length ? <div className="trophies">{rows.map(([id, n], i) => <div key={id} className={'trophy ' + (trophyRank(id) < 4 ? 'epic' : '')} style={{ ['--i' as string]: i }}><b>{n}</b><span>{trophyName(id)}</span></div>)}</div>
      : <p className="fine-print">Play a game with the listener on: first blood, double/triple/ultra kills, rampages, streaks and item goals show up here.</p>}
  </section>
}

/** Manual Roshan/Aegis stopwatch for mouse use (the global hotkeys work the same anywhere: Insert/Alt+Insert/Home to start, Ctrl/⌘+Alt+Insert or +Home to clear). You trigger it; nothing is read from the game. */
function RoshanPanel({ api, live, onState }: { api: AppApi; live: LiveState; onState: (live: LiveState) => void }) {
  const [busy, setBusy] = useState(false)
  const act = (fn: () => Promise<LiveState>) => { setBusy(true); void fn().then(onState).finally(() => setBusy(false)) }
  if (!live.settings.features.roshanTimer) return null
  return <section className="panel form-panel reveal">
    <header className="panel-heading"><div><h2>Roshan / Aegis timer</h2><p>A stopwatch you start yourself when you see Roshan die. Reads nothing from the game.</p></div><Shield size={19} className="quiet-icon" /></header>
    <RoshanTimer roshan={live.roshan} />
    <div className="actions">
      <button className="button secondary" disabled={busy} onClick={() => act(() => api.roshanStart('both'))}>Start both <kbd>Insert</kbd></button>
      <button className="button secondary slim" disabled={busy} onClick={() => act(() => api.roshanStart('rosh'))}>Roshan only <kbd>Alt+Insert</kbd></button>
      <button className="button secondary slim" disabled={busy} onClick={() => act(() => api.roshanStart('aegis'))}>Aegis only <kbd>Home</kbd></button>
      <button className="button secondary slim" disabled={busy} onClick={() => act(() => api.roshanClear('both'))}>Clear <kbd>Ctrl/⌘+Alt+Insert</kbd></button>
    </div>
  </section>
}

export function LiveSetup({ api, context, live, onState, onAccount }: Props) {
  const [busy, setBusy] = useState('')
  const [installed, setInstalled] = useState(false)
  const [feedback, setFeedback] = useState({ message: '', error: false })
  const hero = context.catalog.heroes.find((hero) => hero.slug === live.lane?.heroSlug)
  const actual = live.armed || live.settings.display === 'Companion'
  const settings = live.settings
  const active = live.status === 'Live' || live.status === 'Paused'

  async function act(label: string, operation: () => Promise<string | void>) {
    setBusy(label)
    setFeedback({ message: '', error: false })
    try {
      const message = await operation()
      if (message) setFeedback({ message, error: false })
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'This action could not be completed.', error: true })
    } finally { setBusy('') }
  }

  function setting<K extends keyof LiveSettings>(key: K, value: LiveSettings[K]) {
    void act('settings', async () => { onState(await api.liveSettings({ ...settings, [key]: value })) })
  }

  return <>
    <div className="page-heading"><div><h1>Live &amp; coach</h1><p>Connect Dota's game feed for real-time scoring, tips and achievements against hero benchmarks.</p></div>
      <span className={'status-pill ' + (active ? 'connected' : '')}><i /> {live.status}</span></div>
    <Feedback {...feedback} />
    <div className="detail-grid live-grid">
      <section className="panel form-panel">
        <header className="panel-heading"><div><h2>Game connection</h2><p>Dota Game State Integration</p></div><span className="metric-icon orange"><Radio size={18} /></span></header>
        <ol className="setup-steps">
          <li><div><strong>Set your Dota account</strong><p>{context.accountId ? 'Account ' + context.accountId : 'The listener matches the feed to your own account.'}</p></div>
            <button className="button secondary slim" onClick={onAccount}>{context.accountId ? 'Change' : 'Add account'}</button></li>
          <li><div><strong>Save the GSI config</strong><p>In Steam, open Dota 2’s local files. Create <code>game/dota/cfg/gamestate_integration</code> if it’s missing. Save the file there and add <code>-gamestateintegration</code> to Dota’s launch options. Restart Dota.</p></div>
            <span className="inline-actions">{context.local.installFound && <button className="button secondary slim" disabled={!!busy} onClick={() => void act('install', async () => { const message = await api.installConfig(); setInstalled(true); return message })}><Download size={15} /> {installed || context.local.gsiInstalled ? 'Reinstall' : 'Install'}</button>}
            <button className="button secondary slim" disabled={!!busy || !context.desktop} onClick={() => void act('config', async () =>
              await api.saveConfig() ? 'Config saved. Restart Dota after installing it.' : undefined)}><Download size={15} /> Save as…</button></span></li>
          <li><div><strong>Join a local practice lobby</strong><p>Start the listener, then enter a local practice lobby with your own hero.</p></div></li>
        </ol>
        <div className="actions">
          <button className="button primary" disabled={!!busy || !context.desktop || (!context.accountId && !live.armed)}
            onClick={() => void act('practice', async () => { onState(await api.practice(!live.armed)) })}>
            <Radio size={16} />{live.armed ? 'Stop listener' : 'Start practice listener'}</button>
          <button className="text-button" onClick={() => void api.openExternal('gsi')}>Setup reference <ArrowUpRight size={14} /></button>
        </div>
        {live.receivedAt != null && <p className="fine-print">Latest local update {new Date(live.receivedAt).toLocaleTimeString()}</p>}
        {live.status === 'Unsupported session' && <p className="fine-print">The feed could not verify a supported session and your own account.</p>}
      </section>
      <section className="panel overlay-preview">
        <header className="panel-heading"><div><h2>{settings.display === 'Companion' ? 'Companion window' : actual ? 'Practice lane card' : 'Overlay preview'}</h2>
          <p>{actual ? 'Own-player stats from the local feed' : 'Example lane card at 7:13'}</p></div><Monitor size={19} className="quiet-icon" /></header>
        <div className="overlay-stage">{live.coach ? <CoachCard coach={live.coach} game={live.game} support={live.support} heroes={context.catalog.heroes} settings={settings} heroName={hero?.name ?? 'Hero'} clockText={clock(live.lane?.clock ?? null)} /> : <LaneCard live={live} preview={!actual} hero={hero} />}</div>
        <button className="button secondary" disabled={!!busy || !context.desktop || settings.display !== 'Overlay' || (!active && !live.open)} onClick={() =>
          void act('overlay', async () => { onState(await api.toggleOverlay()) })}><Layers3 size={16} />{live.open ? 'Hide overlay' : 'Show overlay'}</button>
        {!active && settings.display === 'Overlay' && <p className="fine-print">Connect a supported practice lobby to show the overlay.</p>}
        <button className="button secondary" disabled={!!busy || !context.desktop} onClick={() =>
          void act('draftOverlay', async () => { onState(await api.toggleDraftOverlay()) })}><Layers3 size={16} />Draft overlay · Ctrl/⌘ + Shift + F9</button>
        <p className="fine-print">Draft overlay works in any lobby: it only shows picks you type. Over fullscreen: macOS and Windows borderless are supported; Windows exclusive fullscreen cannot be overlaid, so pick Borderless in Dota's video settings.</p>
        <p className="fine-print">{live.shortcutAvailable ? 'Hide shortcut · Ctrl/⌘ + Shift + F10' : 'The hide shortcut is unavailable. Use this window to hide the overlay.'}</p>
      </section>
    </div>
    <section className="panel form-panel">
      <header className="panel-heading"><div><h2>Display preferences</h2><p>Choose the screen and placement for windowed or borderless play.</p></div></header>
      <div className="settings-grid">
        <label className="field">Layout<select disabled={!!busy} value={settings.display} onChange={(event) => setting('display', event.target.value as LiveSettings['display'])}><option>Overlay</option><option>Companion</option></select></label>
        <label className="field">Monitor<select disabled={!!busy || settings.display === 'Companion'} value={settings.monitor} onChange={(event) => setting('monitor', event.target.value)}>{context.displays.map((display) => <option key={display.id} value={display.id}>{display.name}</option>)}</select></label>
        <label className="field">Placement<select disabled={!!busy || settings.display === 'Companion'} value={settings.placement} onChange={(event) => setting('placement', event.target.value as Placement)}>{positions.map((position) => <option key={position}>{position}</option>)}</select></label>
        <label className="field">Card size<select disabled={!!busy} value={settings.size} onChange={(event) => setting('size', event.target.value as LiveSettings['size'])}><option>Compact</option><option>Large</option></select></label>
        <label className="field">Practice role<select disabled={!!busy} value={settings.role} onChange={(event) => setting('role', event.target.value as LiveSettings['role'])}>{roles.map((role) => <option key={role}>{role}</option>)}</select></label>
      </div>
      <label className="field">Overlay opacity ({Math.round(settings.opacity * 100)}%)<input type="range" min={50} max={100} step={5} disabled={!!busy} value={Math.round(settings.opacity * 100)} onChange={(event) => setting('opacity', Number(event.target.value) / 100)} /></label>
      <label className="check-field"><input type="checkbox" checked={settings.cues} disabled={!!busy} onChange={(event) => setting('cues', event.target.checked)} />
        <span>Show practice timing cues <small>Approximate clock-based stack and pull windows. Camp and side timings vary.</small></span></label>
    </section>
    <RoshanPanel api={api} live={live} onState={onState} />
    <Trophies career={live.career} />
    <section className="panel form-panel">
      <header className="panel-heading"><div><h2>Features</h2><p>Switch anything off. Changes apply instantly to the overlay and the app.</p></div>
        <div className="actions"><button className="button slim" disabled={!!busy} onClick={() => setting('detailed', !settings.detailed)}>{settings.detailed ? 'Detailed overlay: on' : 'Detailed overlay: off'} <kbd>F8</kbd></button></div></header>
      <div className="feature-groups">{(['Overlay modules', 'Intelligence', 'Automation'] as const).map((group) => <div key={group}><h3>{group}</h3>
        {featureKeys.filter((k) => featureInfo[k].group === group).map((k: FeatureKey) => <label className="check-field" key={k}>
          <input type="checkbox" checked={settings.features[k]} disabled={!!busy} onChange={(event) => setting('features', { ...settings.features, [k]: event.target.checked })} />
          <span>{featureInfo[k].label} <small>{featureInfo[k].help}</small></span></label>)}</div>)}</div>
    </section>
    <div className="detail-grid live-grid">
      <section className="panel form-panel policy-panel">
        <header className="panel-heading"><div><h2>Session availability</h2><p>Live mode eligibility</p></div><ShieldCheck size={19} className="quiet-icon" /></header>
        <div className="eligibility"><CheckCircle2 size={16} /> Practice lobbies</div>
        <div className="eligibility pending"><CircleHelp size={16} /> Matchmaking games: draft and post-match review</div>
      </section>
      <section className="panel form-panel policy-panel">
        <header className="panel-heading"><div><h2>Connection diagnostics</h2><p>Export field shapes and validation results from the current session.</p></div></header>
        <button className="button secondary" disabled={!!busy || !context.desktop} onClick={() => void act('export', async () =>
          await api.exportDiagnostics() ? 'Redacted diagnostics exported.' : undefined)}><FileDown size={16} /> Export redacted diagnostics</button>
      </section>
    </div>
  </>
}
