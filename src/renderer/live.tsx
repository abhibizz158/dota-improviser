import { useEffect, useState } from 'react'
import { ArrowUpRight, CheckCircle2, CircleHelp, Download, FileDown, Layers3, Monitor, Radio, Shield, ShieldCheck } from 'lucide-react'
import type { AppApi, Bootstrap, FeatureKey, LiveSettings, LiveState, Placement } from '../shared/model'
import { featureInfo, featureKeys, placements, roleLabels, roles } from '../shared/model'
import { brackets } from '../shared/contextual-coach'
import { OutlookGraph } from './match-outlook'
import { ShareMatch } from './share-match'
import { CoachCard, Dialog, Feedback, LaneCard, RecoveryCard, RoshanTimer, SessionPrompt, clock } from './ui'

type Props = { api: AppApi; context: Bootstrap; live: LiveState; onState: (live: LiveState) => void; onAccount: () => void }

const trophyName = (id: string) => id === 'first-blood' ? 'First Blood' : id.startsWith('multi-') ? id.slice(6) : id.startsWith('streak-') ? ({ '3': 'Killing Spree', '4': 'Dominating', '5': 'Mega Kill', '6': 'Unstoppable', '7': 'Wicked Sick', '8': 'Monster Kill', '9': 'Godlike', '10': 'Beyond Godlike' } as Record<string, string>)[id.slice(7)] ?? id
  : id === 'comeback' ? 'Against the odds' : id === 'no-death-10' ? 'Untouched at 10:00' : id === 'cs-60' ? '60 last hits by 10:00' : id.startsWith('goal-') ? 'Goal: ' + id.slice(5).replaceAll('_', ' ') : id
const trophyRank = (id: string) => id.includes('Rampage') ? 0 : id.includes('Ultra') ? 1 : id.includes('Triple') ? 2 : id.includes('Double') ? 3 : id === 'first-blood' ? 4 : 5

/** Career trophy case: every achievement your own game feed has recorded on this device. */
export function Trophies({ career }: { career: Record<string, number> }) {
  const rows = Object.entries(career).sort((a, b) => trophyRank(a[0]) - trophyRank(b[0]) || b[1] - a[1])
  return <section className="panel form-panel reveal">
    <header className="panel-heading"><div><h2>Trophy case</h2><p>Achievements recorded from your own games on this device</p></div></header>
    {rows.length ? <div className="trophies">{rows.map(([id, n], i) => <div key={id} className={'trophy ' + ((trophyRank(id) < 4 || id === 'comeback') ? 'epic' : '')} style={{ ['--i' as string]: i }}><b>{n}</b><span>{trophyName(id)}</span></div>)}</div>
      : <p className="fine-print">Play a game with the listener on: first blood, double/triple/ultra kills, rampages, streaks and item goals show up here.</p>}
  </section>
}

/** Manual Roshan/Aegis stopwatch, started by the player. */
function RoshanPanel({ api, live, onState }: { api: AppApi; live: LiveState; onState: (live: LiveState) => void }) {
  const [busy, setBusy] = useState(false)
  const act = (fn: () => Promise<LiveState>) => { setBusy(true); void fn().then(onState).finally(() => setBusy(false)) }
  if (!live.settings.features.roshanTimer) return null
  return <section className="panel form-panel reveal">
    <header className="panel-heading"><div><h2>Roshan / Aegis timer</h2><p>A stopwatch you start yourself when you see Roshan die. Reads nothing from the game.</p></div><Shield size={19} className="quiet-icon" /></header>
    <RoshanTimer roshan={live.roshan} />
    <div className="actions">
      <button className="button secondary" disabled={busy} onClick={() => act(() => api.roshanStart('both'))}>Start both <kbd>Ctrl/⌘+Alt+F6</kbd></button>
      <button className="button secondary slim" disabled={busy} onClick={() => act(() => api.roshanStart('rosh'))}>Roshan only <kbd>Ctrl/⌘+Alt+F7</kbd></button>
      <button className="button secondary slim" disabled={busy} onClick={() => act(() => api.roshanStart('aegis'))}>Aegis only <kbd>Ctrl/⌘+Alt+F8</kbd></button>
      <button className="button secondary slim" disabled={busy} onClick={() => act(() => api.roshanClear('both'))}>Clear <kbd>Ctrl/⌘+Alt+F9</kbd></button>
    </div>
  </section>
}

export function LiveSetup({ api, context, live, onState, onAccount }: Props) {
  const [busy, setBusy] = useState('')
  const [editingSession, setEditingSession] = useState(false)
  const [itemAnswer, setItemAnswer] = useState<{ context: string; answer: string } | null>(null)
  const itemContext = [live.lane?.heroSlug, live.coaching?.phase, live.coach?.role, live.coaching?.items?.map(({ key }) => key).join(',')].join(':')
  const [installed, setInstalled] = useState(false)
  const [feedback, setFeedback] = useState({ message: '', error: false })
  const [visionBusy, setVisionBusy] = useState(false)
  const [visionResult, setVisionResult] = useState<Awaited<ReturnType<AppApi['visionDebug']>> | null>(null)
  const [visionError, setVisionError] = useState('')
  const [portraitSlot, setPortraitSlot] = useState('')
  const [portraitHero, setPortraitHero] = useState('')
  const [portraitMessage, setPortraitMessage] = useState('')
  const [portraitSaving, setPortraitSaving] = useState(false)
  useEffect(() => {
    if (!live.draftVisionActive) {
      setVisionResult(null); setVisionError(''); setPortraitSlot(''); setPortraitHero(''); setPortraitMessage('')
    }
  }, [live.draftVisionActive])
  const hero = context.catalog.heroes.find((hero) => hero.slug === live.lane?.heroSlug)
  const actual = live.armed || live.settings.display === 'Companion'
  const settings = live.settings
  const latestScore = live.performance?.points.findLast((point) => point.score != null)
  const mac = context.desktop && /Mac/.test(navigator.platform)
  const share = live.draftWindowShare
  const pickerBusy = share === 'choosing' || share === 'starting'
  const canShare = mac && share && share !== 'unsupported'
  const shareMessage = live.draftVisionActive && (share === 'choosing' ? 'Choose the Dota 2 window in the macOS picker.'
    : share === 'starting' ? 'Connecting to the selected Dota window…'
    : share === 'sharing' ? 'Dota window shared for this draft.'
    : share === 'wrong-window' ? 'Choose the main Dota 2 window to read the draft.'
    : share === 'unavailable' ? 'macOS could not share the Dota window. Keep Dota visible and try again.'
    : share === 'stopped' ? 'Window sharing stopped. Choose the Dota window again to resume.' : '')
  const active = live.status === 'Live' || live.status === 'Paused'
  useEffect(() => { if (!active) { setEditingSession(false); setItemAnswer(null) } }, [active])

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
          <li><div><strong>Start a game</strong><p>Start the listener, then enter any practice lobby, normal or ranked matchmaking game with your own hero.</p></div></li>
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
        <header className="panel-heading"><div><h2>{settings.display === 'Companion' ? 'Companion window' : actual ? 'Live coach' : 'Overlay preview'}</h2>
          <p>{actual ? 'Own-player stats from the local feed' : 'Example lane card at 7:13'}</p></div><Monitor size={19} className="quiet-icon" /></header>
        <div className="overlay-stage">{live.coach ? <CoachCard coach={live.coach} game={live.game} support={live.support} heroes={context.catalog.heroes} settings={settings} coaching={live.coaching} performance={live.performance} heroName={hero?.name ?? 'Hero'} clockText={clock(live.lane?.clock ?? null)} compact={settings.size === 'Compact'} /> : <LaneCard live={live} preview={!actual} hero={hero} />}</div>
        {!!live.coaching?.items?.length && settings.features.overlayAssistant && !live.recovery && <div className="live-item-ai">
          <button className="button secondary slim" type="button" disabled={!!busy} onClick={() =>
            void act('item-ai', async () => {
              const answer = await api.askLiveCoach('Which of the suggested items should I prioritize for the next objective, and why?')
              setItemAnswer({ context: itemContext, answer })
            })}>{busy === 'item-ai' ? 'Asking Puter…' : 'Ask Puter about these items'}</button>
          {itemAnswer?.context === itemContext && <p className="fine-print">{itemAnswer.answer}</p>}
        </div>}
        {live.recovery && <RecoveryCard recovery={live.recovery} />}
        {live.recovery && live.draft.enemy.length > 0 && <label className="field">Who killed you?
          <select disabled={!!busy} value={live.confirmedKiller ?? ''} onChange={(event) => {
            const id = Number(event.target.value) || null
            void act('killer', async () => { onState(await api.setDeathKiller(id)) })
          }}>
            <option value="">Unknown</option>
            {context.catalog.heroes.filter(({ id }) => live.draft.enemy.includes(id)).map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
          </select>
        </label>}
        <button className="button secondary" disabled={!!busy || !context.desktop || settings.display !== 'Overlay' || (!active && !live.pick && !live.open)} onClick={() =>
          void act('overlay', async () => { onState(await api.toggleOverlay()) })}><Layers3 size={16} />{live.open ? 'Hide overlay' : 'Show overlay'}</button>
        {live.coach && <button className="button secondary" type="button" onClick={() => setEditingSession(true)}>Game type and lane</button>}
        {editingSession && live.coach && <Dialog title="Edit this match" onClose={() => setEditingSession(false)}>
          <SessionPrompt initial={{ gameType: live.sessionInfo.gameType, lane: live.sessionInfo.lane ?? live.coach.role }}
            submitLabel="Save changes" onSubmit={async (mode, role) => { onState(await api.setSessionInfo(mode, role)); setEditingSession(false) }} />
        </Dialog>}
        {live.coach && live.lane && <ShareMatch api={api} stats={{
          ...live.coach.stats, hero: hero?.name ?? 'My hero', at: live.lane.clock, status: live.lane.paused ? 'Paused' : 'In progress',
          mode: live.sessionInfo.gameType ?? (live.coach.matchmaking ? null : 'Practice'), role: roleLabels[live.coach.role],
          gpm: live.coach.gpm, xpm: live.coach.xpm,
          performance: latestScore?.score == null ? undefined : { score: latestScore.score, at: latestScore.at },
        }} />}
        {!active && settings.display === 'Overlay' && <p className="fine-print">Connect a supported game (practice, normal or ranked) to show the overlay.</p>}
        <button className="button secondary" disabled={!!busy || !context.desktop || settings.display !== 'Overlay'} onClick={() =>
          void act('draftOverlay', async () => { onState(await api.toggleDraftOverlay()) })}><Layers3 size={16} />Edit draft overlay · Ctrl/⌘ + Shift + O</button>
        <p className="fine-print">Choose the game type and lane directly on the overlay. During play, use the shortcut to open controls. Use Borderless or Companion if fullscreen covers the overlay.</p>
        <p className="fine-print">{live.shortcutAvailable ? 'Show or hide shortcut · Ctrl/⌘ + Shift + H' : 'The hide shortcut is unavailable. Use this window to hide the overlay.'}</p>
        <p className="fine-print">Compact/large overlay · Ctrl/⌘ + Shift + C</p>
        {settings.features.overlayAssistant && <p className="fine-print">{live.assistantShortcutAvailable ? 'Overlay on (edit draft, or ask the AI assistant once a game is live) · Ctrl/⌘ + Shift + O' : 'The overlay-on shortcut is unavailable on this device.'}</p>}
      </section>
    </div>
    <section className="panel form-panel">
      <header className="panel-heading"><div><h2>Display preferences</h2><p>Choose the screen and placement for windowed or borderless play.</p></div></header>
      <div className="settings-grid">
        <label className="field">Layout<select disabled={!!busy} value={settings.display} onChange={(event) => setting('display', event.target.value as LiveSettings['display'])}><option>Overlay</option><option>Companion</option></select></label>
        <label className="field">Monitor<select disabled={!!busy || settings.display === 'Companion'} value={settings.monitor} onChange={(event) => setting('monitor', event.target.value)}>
          {!(live.displays ?? context.displays).some(({ id }) => id === settings.monitor) && <option value={settings.monitor}>{settings.monitor === 'auto' ? 'Follow Dota' : 'Saved display unavailable'}</option>}
          {(live.displays ?? context.displays).map((display) => <option key={display.id} value={display.id}>{display.name}</option>)}</select></label>
        <label className="field">Placement<select disabled={!!busy || settings.display === 'Companion'} value={settings.placement} onChange={(event) => setting('placement', event.target.value as Placement)}>{placements.map((position) => <option key={position} value={position}>{position === 'Auto' ? 'Auto · draft left, lane right' : position}</option>)}</select></label>
        <label className="field">Card size<select disabled={!!busy} value={settings.size} onChange={(event) => setting('size', event.target.value as LiveSettings['size'])}><option>Compact</option><option>Large</option></select></label>
        <label className="field">Ranked coaching bracket<select disabled={!!busy} value={settings.coachingBracket ?? ''} onChange={(event) => setting('coachingBracket', (event.target.value || undefined) as LiveSettings['coachingBracket'])}>
          <option value="">Any rank</option>{brackets.map((bracket) => <option key={bracket}>{bracket}</option>)}
        </select></label>
        <label className="field">Practice role<select disabled={!!busy} value={settings.role} onChange={(event) => setting('role', event.target.value as LiveSettings['role'])}>{roles.map((role) => <option key={role}>{role}</option>)}</select></label>
      </div>
      {settings.display === 'Overlay' && settings.monitor === 'auto' && (
        !live.detectionAvailable
          ? <p className="fine-print">Automatic window detection isn't available on this build (its native module failed to load). Pick a monitor above instead of "Follow Dota".</p>
          : <p className="fine-print">{live.overlayDisplay ? (live.overlayDisplay.following ? 'Dota display: ' : 'Fallback display: ') + live.overlayDisplay.name + '. ' : ''}Follow Dota tracks the active game window. If it cannot detect the game, choose a monitor here.</p>
      )}
      <label className="field">Overlay opacity ({Math.round(settings.opacity * 100)}%)<input type="range" min={50} max={100} step={5} disabled={!!busy} value={Math.round(settings.opacity * 100)} onChange={(event) => setting('opacity', Number(event.target.value) / 100)} /></label>
      <label className="check-field"><input type="checkbox" checked={settings.cues} disabled={!!busy} onChange={(event) => setting('cues', event.target.checked)} />
        <span>Show practice timing cues <small>Approximate clock-based stack and pull windows. Camp and side timings vary.</small></span></label>
      <label className="check-field"><input type="checkbox" checked={settings.saveOwnMatches} disabled={!!busy} onChange={(event) => setting('saveOwnMatches', event.target.checked)} />
        <span>Save my completed match stats locally <small>With GSI connected, save your own scoreboard when Dota sends a result. Keeps up to 20 matches on this device. It cannot backfill past games.</small></span></label>
    </section>
    {settings.features.performanceMeter && <section className="panel form-panel">
      <header className="panel-heading"><div><h2>Personal performance</h2><p>Scores from 0 to 100 every five minutes. A higher score means you outpaced more of your past matches.</p></div></header>
      <p className="fine-print">Open parsed games in Match Review to add earlier benchmarks. The app also keeps five-minute checkpoints from matches it follows. A score needs at least three comparable matches.</p>
    </section>}
    <RoshanPanel api={api} live={live} onState={onState} />
    {live.game?.outlook && <section className="panel form-panel">
      <header className="panel-heading"><div><h2>Match outlook</h2><p>{live.game.outlook.scope} · Estimated {live.game.outlook.win}% team win chance</p></div></header>
      <OutlookGraph points={live.game.outlook.points} detailed />
      <p className="fine-print">{live.game.outlook.factors.join(' · ')}</p>
    </section>}
    <Trophies career={live.career} />
    <section className="panel form-panel">
      <header className="panel-heading"><div><h2>Features</h2><p>Switch anything off. Changes apply instantly to the overlay and the app.</p></div>
        <div className="actions"><button className="button slim" disabled={!!busy} onClick={() => setting('detailed', !settings.detailed)}>{settings.detailed ? 'Detailed overlay: on' : 'Detailed overlay: off'}</button></div></header>
      <div className="feature-groups">{(['Overlay modules', 'Intelligence', 'Automation'] as const).map((group) => <div key={group}><h3>{group}</h3>
        {featureKeys.filter((k) => featureInfo[k].group === group).map((k: FeatureKey) => <label className="check-field" key={k}>
          <input type="checkbox" checked={settings.features[k]} disabled={!!busy} onChange={(event) => setting('features', { ...settings.features, [k]: event.target.checked })} />
          <span>{featureInfo[k].label} <small>{featureInfo[k].help}</small></span></label>)}</div>)}</div>
    </section>
    {settings.features.draftVision && <section className="panel form-panel reveal">
      <header className="panel-heading"><div><h2>Test draft vision</h2><p>Check the portrait strip and recognized heroes during hero selection or strategy time.</p></div></header>
      {!live.draftVisionActive && <p className="fine-print">Capture and window sharing become available during Hero Selection and Strategy Time.</p>}
      <div className="actions">
        {canShare && <button className="button primary" type="button"
          disabled={!!busy || visionBusy || pickerBusy || share === 'sharing' || !live.draftVisionActive}
          onClick={() => {
            setVisionError('')
            void act('vision', async () => { onState(await api.chooseDraftWindow()) })
          }}>Share Dota window</button>}
        <button className="button secondary" disabled={visionBusy || pickerBusy || !context.desktop || !live.draftVisionActive} onClick={() => {
          setVisionBusy(true); setVisionError(''); setVisionResult(null); setPortraitSlot(''); setPortraitHero(''); setPortraitMessage('')
          void api.visionDebug().then(setVisionResult).catch((error: Error) => setVisionError(error.message.replace(/^Error invoking remote method '[^']+': Error: /, ''))).finally(() => setVisionBusy(false))
        }}>{visionBusy ? 'Capturing…' : 'Capture now'}</button>
        {mac && <>
          <button className="button secondary" type="button" disabled={!!busy || pickerBusy || share === 'sharing' || !live.draftVisionActive} onClick={() => {
            setVisionError('')
            void act('vision', async () => await api.requestDraftScreenRecording() ? 'Screen Recording access is available.'
              : 'If macOS still shows access enabled, follow Reset instructions or share the Dota window.')
          }}>Request Screen Recording</button>
          <button className="text-button" type="button" onClick={() => void act('vision', () => api.openExternal('screenRecording'))}>Open Screen Recording settings <ArrowUpRight size={14} /></button>
        </>}
      </div>
      {shareMessage && <Feedback message={shareMessage} error={share === 'wrong-window' || share === 'unavailable'} />}
      <Feedback message={visionError} error />
      {mac && <details className="fine-print">
        <summary>Reset instructions for an outdated permission</summary>
        <p>After an update, macOS can show an enabled switch for an older signature. Quit Dota Improviser, then run this in Terminal to reset only this app’s Screen Recording permission.</p>
        <p><code>tccutil reset ScreenCapture com.dotaimproviser.app</code></p>
        <p>Reopen Dota Improviser from Applications and request access during the next draft. If macOS asks, allow access and choose Quit &amp; Reopen.</p>
      </details>}
      {live.draftVisionActive && visionResult && <div className="vision-debug">
        <p className="fine-print">{visionResult.radiant.filter(Boolean).length + visionResult.dire.filter(Boolean).length} of 10 slots recognized · {visionResult.references} hero portraits loaded · {visionResult.barWidth} × {visionResult.barHeight}</p>
        <img src={visionResult.barPng} alt="Captured pick-bar strip" />
        <div className="vision-rows"><p><strong>Radiant:</strong> {visionResult.radiantNames.map((n) => n ?? '—').join(', ') || 'none matched'}</p>
          <p><strong>Dire:</strong> {visionResult.direNames.map((n) => n ?? '—').join(', ') || 'none matched'}</p></div>
        {settings.features.learning && context.accountId && visionResult.trainable.some(Boolean) && <details>
          <summary>Teach a cosmetic portrait</summary>
          <p className="fine-print">Label a visible Arcana, Persona, or other portrait. The app remembers the small portrait sample on this device.</p>
          <div className="actions">
            <label className="field">Portrait slot<select value={portraitSlot} disabled={portraitSaving} onChange={(event) => {
              setPortraitSlot(event.target.value); setPortraitMessage('')
            }}>
              <option value="">Select a slot</option>
              {[...visionResult.radiantNames, ...visionResult.direNames].map((name, i) => visionResult.trainable[i] &&
                <option key={i} value={i}>{i < 5 ? 'Radiant' : 'Dire'} {(i % 5) + 1} · {name ?? 'Unrecognized'}</option>)}
            </select></label>
            <label className="field">Actual hero<select value={portraitHero} disabled={portraitSaving} onChange={(event) => setPortraitHero(event.target.value)}>
              <option value="">Select a hero</option>
              {context.catalog.heroes.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </select></label>
            <button className="button secondary" type="button" disabled={portraitSaving || !portraitSlot || !portraitHero} onClick={() => {
              setPortraitSaving(true); setPortraitMessage(''); setVisionError('')
              void api.learnDraftPortrait(Number(portraitSlot), Number(portraitHero)).then(() => {
                setPortraitMessage('Saved. The next draft scans will compare against this portrait.')
              }).catch((error: Error) => setVisionError(error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')))
                .finally(() => setPortraitSaving(false))
            }}>Remember portrait</button>
          </div>
          <Feedback message={portraitMessage} />
        </details>}
      </div>}
    </section>}
    <div className="detail-grid live-grid">
      <section className="panel form-panel policy-panel">
        <header className="panel-heading"><div><h2>Session availability</h2><p>Live mode eligibility</p></div><ShieldCheck size={19} className="quiet-icon" /></header>
        <div className="eligibility"><CheckCircle2 size={16} /> Practice lobbies: live coach, draft and achievements</div>
        <div className="eligibility"><CheckCircle2 size={16} /> Normal and ranked matchmaking: live coach, draft and achievements</div>
        <div className="eligibility pending"><CircleHelp size={16} /> Post-match review relies on OpenDota's public match parse, which can lag behind the game.</div>
      </section>
      <section className="panel form-panel policy-panel">
        <header className="panel-heading"><div><h2>Connection diagnostics</h2><p>Export field shapes and validation results from the current session.</p></div></header>
        <button className="button secondary" disabled={!!busy || !context.desktop} onClick={() => void act('export', async () =>
          await api.exportDiagnostics() ? 'Redacted diagnostics exported.' : undefined)}><FileDown size={16} /> Export redacted diagnostics</button>
      </section>
    </div>
  </>
}
