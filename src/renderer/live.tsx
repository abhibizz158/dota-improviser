import { useEffect, useState } from 'react'
import { ArrowUpRight, CheckCircle2, CircleHelp, Download, Droplet, Eye, FileDown, Flame, Layers3, Monitor, Radio, Shield, ShieldCheck, Swords, Target, TrendingUp } from 'lucide-react'
import type { AppApi, Bootstrap, LiveSettings, LiveState } from '../shared/model'
import { roleLabels, roles } from '../shared/model'
import { brackets } from '../shared/contextual-coach'
import { OutlookGraph } from './match-outlook'
import { ShareMatch } from './share-match'
import { CoachCard, Dialog, Feedback, LaneCard, RecoveryCard, RoshanTimer, SessionPrompt, clock } from './ui'

type Props = { api: AppApi; context: Bootstrap; live: LiveState; onState: (live: LiveState) => void; onAccount: () => void }

const STREAK_NAMES: Record<string, string> = { '3': 'Killing Spree', '4': 'Dominating', '5': 'Mega Kill', '6': 'Unstoppable', '7': 'Wicked Sick', '8': 'Monster Kill', '9': 'Godlike', '10': 'Beyond Godlike' }
const VISION_NAMES: Record<string, string> = { '10': '10 wards placed', '25': '25 wards placed', '50': '50 wards placed', '100': '100 wards placed', '250': '250 wards placed' }
const trophyName = (id: string) => id === 'first-blood' ? 'First Blood' : id.startsWith('multi-') ? id.slice(6) : id.startsWith('streak-') ? STREAK_NAMES[id.slice(7)] ?? id
  : id === 'comeback' ? 'Against the odds' : id === 'no-death-10' ? 'Untouched at 10:00' : id.startsWith('cs-') ? id.slice(3) + ' last hits by 10:00'
  : id.startsWith('vision-') ? VISION_NAMES[id.slice(7)] ?? id : id.startsWith('goal-') ? 'Goal: ' + id.slice(5).replaceAll('_', ' ') : id
const trophyRank = (id: string) => id.includes('Rampage') ? 0 : id.includes('Ultra') ? 1 : id.includes('Triple') ? 2 : id.includes('Double') ? 3 : id === 'first-blood' ? 4 : 5
/** Milestone/multi-kill/streak thresholds, grounded in how rare each actually is to pull off: a Rampage or
 * Beyond Godlike is a different achievement than a Double Kill, even though both land in the same trophy case. */
const trophyRarity = (id: string): 'common' | 'rare' | 'epic' | 'legendary' => {
  if (id === 'comeback') return 'legendary'
  if (id.startsWith('multi-')) return id.includes('Rampage') ? 'legendary' : id.includes('Ultra') ? 'epic' : id.includes('Triple') ? 'rare' : 'common'
  if (id.startsWith('streak-')) { const n = Number(id.slice(7)); return n >= 9 ? 'legendary' : n >= 7 ? 'epic' : n >= 5 ? 'rare' : 'common' }
  if (id.startsWith('vision-')) { const n = Number(id.slice(7)); return n >= 100 ? 'legendary' : n >= 50 ? 'epic' : n >= 25 ? 'rare' : 'common' }
  if (id === 'no-death-10' || id === 'cs-60') return 'rare'
  if (id === 'cs-80') return 'epic'
  if (id === 'cs-100') return 'legendary'
  return 'common'
}
const trophySection = (id: string): string => id.startsWith('multi-') ? 'Multi-kills' : id.startsWith('streak-') ? 'Kill streaks'
  : id === 'comeback' ? 'Comebacks' : id.startsWith('vision-') ? 'Vision' : 'Milestones'
const SECTION_ORDER = ['Kill streaks', 'Multi-kills', 'Milestones', 'Vision', 'Comebacks']
/** One small icon per achievement kind, not just per section — a Rampage and a Double Kill are both "multi-kills"
 * but Swords reads the same for both, which is fine: the rarity badge and count are what tell them apart. */
const trophyIcon = (id: string) => id === 'first-blood' ? Droplet : id.startsWith('multi-') ? Swords : id.startsWith('streak-') ? Flame
  : id === 'comeback' ? TrendingUp : id.startsWith('vision-') ? Eye : id.startsWith('cs-') ? Target : id === 'no-death-10' ? ShieldCheck : Target

/** Career trophy case: every achievement your own game feed has recorded on this device, grouped by kind and
 * tagged by how rare it actually is to pull off. */
export function Trophies({ career }: { career: Record<string, number> }) {
  // Per-hero item/timing achievements (id shaped "heroId:itemKey") already have their own card, with hero,
  // role and timing, on the Achievements page — showing them again here duplicated them under a raw key.
  const rows = Object.entries(career).filter(([id]) => !/^\d+:/.test(id)).sort((a, b) => trophyRank(a[0]) - trophyRank(b[0]) || b[1] - a[1])
  const sections = SECTION_ORDER.map((name) => [name, rows.filter(([id]) => trophySection(id) === name)] as const).filter(([, group]) => group.length)
  let i = 0
  return <section className="panel form-panel reveal">
    <header className="panel-heading"><div><h2>Trophy case</h2><p>Achievements recorded from your own games on this device</p></div></header>
    {sections.length ? sections.map(([name, group]) => <div key={name} className="trophy-section">
      <h3>{name}</h3>
      <div className="trophies">{group.map(([id, n]) => {
        const rarity = trophyRarity(id)
        const Icon = trophyIcon(id)
        return <div key={id} className={'trophy ' + rarity} style={{ ['--i' as string]: i++ }}>
          <span className="trophy-icon"><Icon size={16} /></span>
          <div className="trophy-body">
            <div className="trophy-top"><b>{n}</b><small className="trophy-rarity">{rarity}</small></div>
            <span className="trophy-name">{trophyName(id)}</span>
          </div>
        </div>
      })}</div>
    </div>)
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
  const hero = context.catalog.heroes.find((hero) => hero.slug === live.lane?.heroSlug)
  const actual = live.armed || live.settings.display === 'Companion'
  const settings = live.settings
  const latestScore = live.performance?.points.findLast((point) => point.score != null)
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
        <header className="panel-heading"><div><h2>{settings.display === 'Companion' ? 'Companion window' : actual ? 'Live coach' : 'Lane card preview'}</h2>
          <p>{actual ? 'Own-player stats from the local feed' : 'Example lane card at 7:13 — configure appearance on the Overlay tab'}</p></div><Monitor size={19} className="quiet-icon" /></header>
        <div className="overlay-stage">{live.coach ? <CoachCard coach={live.coach} game={live.game} support={live.support} heroes={context.catalog.heroes} settings={settings} coaching={live.coaching} performance={live.performance} heroName={hero?.name ?? 'Hero'} clockText={clock(live.lane?.clock ?? null)} compact={settings.size === 'Compact'} /> : <LaneCard live={live} preview={!actual} hero={hero} />}</div>
        {!!live.coaching?.items?.length && settings.features.overlayAssistant && !live.recovery && <div className="live-item-ai">
          <button className="button secondary slim" type="button" disabled={!!busy} onClick={() =>
            void act('item-ai', async () => {
              const answer = await api.analyzeItems()
              setItemAnswer({ context: itemContext, answer })
            })}>{busy === 'item-ai' ? 'Asking Puter…' : 'Ask Puter about this fight'}</button>
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
        <p className="fine-print">{live.shortcutAvailable ? 'Show or hide shortcut · Ctrl/⌘ + Shift + H' : 'The hide shortcut is unavailable. Use this button instead.'}</p>
        {settings.features.overlayAssistant && <p className="fine-print">{live.assistantShortcutAvailable ? 'Overlay on (edit draft, or ask the AI assistant once a game is live) · Ctrl/⌘ + Shift + O' : 'The overlay-on shortcut is unavailable on this device.'}</p>}
        <p className="fine-print">Overlay size, placement and which modules it shows live on the <b>Overlay</b> tab.</p>
      </section>
    </div>
    <section className="panel form-panel">
      <header className="panel-heading"><div><h2>Coaching preferences</h2><p>How the coach scores and benchmarks your games, not how the overlay looks.</p></div></header>
      <div className="settings-grid">
        <label className="field">Ranked coaching bracket<select disabled={!!busy} value={settings.coachingBracket ?? ''} onChange={(event) => setting('coachingBracket', (event.target.value || undefined) as LiveSettings['coachingBracket'])}>
          <option value="">Auto (your own rank)</option>{brackets.map((bracket) => <option key={bracket}>{bracket}</option>)}
        </select>
          <small>In a ranked game, left on Auto this compares your pace against real OpenDota benchmarks for your own rank — a Herald's 50th percentile GPM is a genuinely lower real number than a Divine player's, not the same target scaled down by a guess. Pick a bracket to compare against a different one instead.</small>
        </label>
        <label className="field">Practice role<select disabled={!!busy} value={settings.role} onChange={(event) => setting('role', event.target.value as LiveSettings['role'])}>{roles.map((role) => <option key={role}>{role}</option>)}</select></label>
      </div>
      <label className="check-field"><input type="checkbox" checked={settings.saveOwnMatches} disabled={!!busy} onChange={(event) => setting('saveOwnMatches', event.target.checked)} />
        <span>Save my completed match stats locally <small>With GSI connected, save your own scoreboard when Dota sends a result. Keeps up to 20 matches on this device. It cannot backfill past games.</small></span></label>
    </section>
    <div className="section-heading"><div><h2>Your performance</h2><p>What this session has recorded from your own live matches.</p></div></div>
    {settings.features.performanceMeter && <section className="panel form-panel">
      <header className="panel-heading"><div><h2>Personal performance</h2><p>Scores from 0 to 100 every five minutes. A higher score means you outpaced more of your past matches.</p></div></header>
      <p className="fine-print">Open parsed games in Match Review to add earlier benchmarks. The app also keeps five-minute checkpoints from matches it follows. A score needs at least three comparable matches.</p>
    </section>}
    <RoshanPanel api={api} live={live} onState={onState} />
    {live.game?.outlook && <section className="panel form-panel">
      <header className="panel-heading"><div><h2>Match outlook</h2><p>{live.game.outlook.scope} · Estimated {live.game.outlook.win}% team win chance</p></div></header>
      <OutlookGraph points={live.game.outlook.points} detailed />
      <p className="fine-print">{live.game.outlook.factors.join(' · ')}</p>
      <p className="fine-print">Built from team kills, lineup and your own pace — Dota's own feed never reports tower, Roshan or barracks state during a live match (that's spectator-only data, blocked by this app's fair-play guardrail), so a tower or Roshan lead only shows up here if it also shows up in kills or your pace. The full picture, including towers and net worth, is in Match Review after the game.</p>
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
      <section className="panel form-panel policy-panel">
        <header className="panel-heading"><div><h2>Resource usage</h2><p>{live.resourceMode === 'minimal'
          ? 'Safe minimal mode: free RAM is under 16GB, so idle overlay windows close sooner and decorative effects are trimmed automatically.'
          : 'Full power: plenty of free RAM, so the overlay runs every effect at its normal strength.'}</p></div></header>
        <button className="button secondary" disabled={!!busy || !context.desktop} onClick={() => void act('export', async () =>
          await api.exportResourceLog() ? 'Resource usage log exported.' : undefined)}><FileDown size={16} /> Export resource usage log</button>
      </section>
    </div>
  </>
}
