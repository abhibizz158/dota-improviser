import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpRight, GripVertical, Layers3, Monitor, Swords } from 'lucide-react'
import type { AppApi, Bootstrap, FeatureKey, LiveSettings, LiveState, Placement } from '../shared/model'
import { compactModuleInfo, featureInfo, featureKeys, placements } from '../shared/model'
import { CoachCard, DraftCard, Feedback, LaneCard, clock } from './ui'

type Props = { api: AppApi; context: Bootstrap; live: LiveState; onState: (live: LiveState) => void }

/** Drag-to-reorder list (with Up/Down buttons as a keyboard-accessible equivalent, since native HTML5 drag has
 * no keyboard path). Pure client-side priority order — stored in LiveSettings, read back by CoachCard's compact
 * layout — not a freeform canvas: the overlay stays the small fixed-size panel AGENTS.md documents it as. */
function ReorderList({ order, labels, onMove, disabled }: { order: readonly string[]; labels: Record<string, string>; onMove: (from: number, to: number) => void; disabled?: boolean }) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  return <ul className="reorder-list">
    {order.map((key, i) => <li key={key} draggable={!disabled}
      className={dragIndex === i ? 'dragging' : ''}
      onDragStart={() => setDragIndex(i)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); if (dragIndex != null && dragIndex !== i) onMove(dragIndex, i); setDragIndex(null) }}
      onDragEnd={() => setDragIndex(null)}>
      <span className="reorder-handle" aria-hidden="true"><GripVertical size={14} /></span>
      <span className="reorder-label">{labels[key] ?? key}</span>
      <span className="reorder-buttons">
        <button type="button" className="icon-button" aria-label={'Move ' + (labels[key] ?? key) + ' up'} disabled={disabled || i === 0} onClick={() => onMove(i, i - 1)}><ArrowUp size={14} /></button>
        <button type="button" className="icon-button" aria-label={'Move ' + (labels[key] ?? key) + ' down'} disabled={disabled || i === order.length - 1} onClick={() => onMove(i, i + 1)}><ArrowDown size={14} /></button>
      </span>
    </li>)}
  </ul>
}

/** Everything about how the overlay looks and what it shows — split out of Live & Coach so that page can stay
 * about the game connection and what it's recorded, while this one is purely "configure the overlay". Previews
 * both the pick/strategy-phase card and the in-game card (compact and large side by side) against the live
 * settings below them, so a change is visible immediately without starting a game. */
export function OverlaySetup({ api, context, live, onState }: Props) {
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState({ message: '', error: false })
  const settings = live.settings
  const hero = context.catalog.heroes.find((hero) => hero.slug === live.lane?.heroSlug)
  const active = live.status === 'Live' || live.status === 'Paused'

  async function act(operation: () => Promise<string | void>) {
    setBusy(true)
    setFeedback({ message: '', error: false })
    try {
      const message = await operation()
      if (message) setFeedback({ message, error: false })
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'This action could not be completed.', error: true })
    } finally { setBusy(false) }
  }

  function setting<K extends keyof LiveSettings>(key: K, value: LiveSettings[K]) {
    void act(async () => { onState(await api.liveSettings({ ...settings, [key]: value })) })
  }

  function moveCompact(from: number, to: number) {
    const next = settings.compactOrder.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setting('compactOrder', next)
  }

  const previewCoachProps = {
    heroes: context.catalog.heroes, settings, game: live.game, performance: live.performance, coaching: live.coaching,
    heroName: hero?.name ?? 'Hero', clockText: clock(live.lane?.clock ?? null),
  }

  return <>
    <div className="page-heading"><div><h1>Overlay</h1><p>Everything shown on top of Dota while you play or draft: layout, size, placement and which modules appear.</p></div>
      <span className={'status-pill ' + (live.open ? 'connected' : '')}><i /> {live.open ? 'Overlay shown' : 'Overlay hidden'}</span></div>
    <Feedback {...feedback} />

    <section className="panel form-panel">
      <header className="panel-heading"><div><h2>Live preview</h2><p>Draft/strategy-time card on the left, in-game card compact and large on the right — both reflect your settings below.</p></div><Monitor size={19} className="quiet-icon" /></header>
      <div className="overlay-preview-grid">
        <div className="overlay-preview-box">
          <small>Pick / strategy phase</small>
          <div className="overlay-stage"><DraftCard live={live} heroes={context.catalog.heroes} /></div>
        </div>
        <div className="overlay-preview-box">
          <small>In-game · compact</small>
          <div className="overlay-stage">{live.coach ? <CoachCard coach={live.coach} compact {...previewCoachProps} /> : <LaneCard live={live} preview hero={hero} />}</div>
        </div>
        <div className="overlay-preview-box">
          <small>In-game · large</small>
          <div className="overlay-stage">{live.coach ? <CoachCard coach={live.coach} compact={false} {...previewCoachProps} /> : <LaneCard live={live} preview hero={hero} />}</div>
        </div>
      </div>
      <div className="actions">
        <button className="button secondary" disabled={busy || !context.desktop || settings.display !== 'Overlay' || (!active && !live.pick && !live.open)}
          onClick={() => void act(async () => { onState(await api.toggleOverlay()) })}><Layers3 size={16} />{live.open ? 'Hide overlay' : 'Show overlay'}</button>
        <button className="button secondary" disabled={busy || !context.desktop || settings.display !== 'Overlay'}
          onClick={() => void act(async () => { onState(await api.toggleDraftOverlay()) })}><Swords size={16} />Edit draft overlay · Ctrl/⌘ + Shift + O</button>
      </div>
      <p className="fine-print">{live.shortcutAvailable ? 'Show or hide shortcut · Ctrl/⌘ + Shift + H' : 'The hide shortcut is unavailable on this device. Use this button instead.'} · Compact/large overlay · Ctrl/⌘ + Shift + C</p>
    </section>

    <section className="panel form-panel">
      <header className="panel-heading"><div><h2>Compact overlay layout</h2><p>Drag to reorder which rows show first in the compact in-game card (above). The header and your K/D/LH/GPM row always stay on top; a module only appears when its feature below is on.</p></div></header>
      <ReorderList order={settings.compactOrder} labels={compactModuleInfo} onMove={moveCompact} disabled={busy} />
    </section>

    <section className="panel form-panel">
      <header className="panel-heading"><div><h2>Display preferences</h2><p>Choose the screen and placement for windowed or borderless play.</p></div></header>
      <div className="settings-grid">
        <label className="field">Layout<select disabled={busy} value={settings.display} onChange={(event) => setting('display', event.target.value as LiveSettings['display'])}><option>Overlay</option><option>Companion</option></select></label>
        {settings.display === 'Overlay' && !/Mac/.test(navigator.platform) && <p className="fine-print">On Windows, an exclusive Fullscreen Dota window can cover the overlay entirely — Borderless Windowed or Windowed mode (Settings → Video → Display Mode in Dota) keeps it visible. If you need exclusive Fullscreen, use "Companion" here instead.</p>}
        <label className="field">Monitor<select disabled={busy || settings.display === 'Companion'} value={settings.monitor} onChange={(event) => setting('monitor', event.target.value)}>
          {!(live.displays ?? context.displays).some(({ id }) => id === settings.monitor) && <option value={settings.monitor}>{settings.monitor === 'auto' ? 'Follow Dota' : 'Saved display unavailable'}</option>}
          {(live.displays ?? context.displays).map((display) => <option key={display.id} value={display.id}>{display.name}</option>)}</select></label>
        <label className="field">Placement<select disabled={busy || settings.display === 'Companion'} value={settings.placement} onChange={(event) => setting('placement', event.target.value as Placement)}>{placements.map((position) => <option key={position} value={position}>{position === 'Auto' ? 'Auto · draft left, lane right' : position}</option>)}</select></label>
        <label className="field">Card size<select disabled={busy} value={settings.size} onChange={(event) => setting('size', event.target.value as LiveSettings['size'])}><option>Compact</option><option>Large</option></select></label>
      </div>
      {settings.display === 'Overlay' && settings.monitor === 'auto' && (
        !live.detectionAvailable
          ? <p className="fine-print">Automatic window detection isn't available on this build (its native module failed to load). Pick a monitor above instead of "Follow Dota".</p>
          : <p className="fine-print">{live.overlayDisplay ? (live.overlayDisplay.following ? 'Dota display: ' : 'Fallback display: ') + live.overlayDisplay.name + '. ' : ''}Follow Dota tracks the active game window. If it cannot detect the game, choose a monitor here.</p>
      )}
      <label className="field">Overlay opacity ({Math.round(settings.opacity * 100)}%)<input type="range" min={50} max={100} step={5} disabled={busy} value={Math.round(settings.opacity * 100)} onChange={(event) => setting('opacity', Number(event.target.value) / 100)} /></label>
      <label className="check-field"><input type="checkbox" checked={settings.cues} disabled={busy} onChange={(event) => setting('cues', event.target.checked)} />
        <span>Show practice timing cues <small>Approximate clock-based stack and pull windows. Camp and side timings vary.</small></span></label>
    </section>

    <section className="panel form-panel">
      <header className="panel-heading"><div><h2>Features</h2><p>Switch anything off. Changes apply instantly to the overlay and the app.</p></div>
        <div className="actions"><button className="button slim" disabled={busy} onClick={() => setting('detailed', !settings.detailed)}>{settings.detailed ? 'Detailed overlay: on' : 'Detailed overlay: off'}</button></div></header>
      <div className="feature-groups">{(['Overlay modules', 'Intelligence', 'Automation'] as const).map((group) => <div key={group}><h3>{group}</h3>
        {featureKeys.filter((k) => featureInfo[k].group === group).map((k: FeatureKey) => <label className="check-field" key={k}>
          <input type="checkbox" checked={settings.features[k]} disabled={busy} onChange={(event) => setting('features', { ...settings.features, [k]: event.target.checked })} />
          <span>{featureInfo[k].label} <small>{featureInfo[k].help}</small></span></label>)}</div>)}</div>
    </section>

    <DraftVisionPanel api={api} context={context} live={live} onState={onState} />
  </>
}

/** Screen-reading test/teach panel, split out of the old Live & Coach page — this configures what Draft Vision
 * reads, same as the rest of this tab, rather than something you do mid-match. */
function DraftVisionPanel({ api, context, live, onState }: Props) {
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState({ message: '', error: false })
  const [visionBusy, setVisionBusy] = useState(false)
  const [visionResult, setVisionResult] = useState<Awaited<ReturnType<AppApi['visionDebug']>> | null>(null)
  const [visionError, setVisionError] = useState('')
  const [portraitSlot, setPortraitSlot] = useState('')
  const [portraitHero, setPortraitHero] = useState('')
  const [portraitMessage, setPortraitMessage] = useState('')
  const [portraitSaving, setPortraitSaving] = useState(false)
  useEffect(() => {
    if (!live.draftVisionActive) { setVisionResult(null); setVisionError(''); setPortraitSlot(''); setPortraitHero(''); setPortraitMessage('') }
  }, [live.draftVisionActive])
  if (!live.settings.features.draftVision) return null
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

  async function act(operation: () => Promise<string | void>) {
    setBusy(true)
    setFeedback({ message: '', error: false })
    try {
      const message = await operation()
      if (message) setFeedback({ message, error: false })
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'This action could not be completed.', error: true })
    } finally { setBusy(false) }
  }

  return <section className="panel form-panel reveal">
    <header className="panel-heading"><div><h2>Test draft vision</h2><p>Check the portrait strip and recognized heroes during hero selection or strategy time.</p></div></header>
    {!live.draftVisionActive && <p className="fine-print">Capture and window sharing become available during Hero Selection and Strategy Time.</p>}
    <div className="actions">
      {canShare && <button className="button primary" type="button"
        disabled={busy || visionBusy || pickerBusy || share === 'sharing' || !live.draftVisionActive}
        onClick={() => void act(async () => { onState(await api.chooseDraftWindow()) })}>Share Dota window</button>}
      <button className="button secondary" disabled={visionBusy || pickerBusy || !context.desktop || !live.draftVisionActive} onClick={() => {
        setVisionBusy(true); setVisionError(''); setVisionResult(null); setPortraitSlot(''); setPortraitHero(''); setPortraitMessage('')
        void api.visionDebug().then(setVisionResult).catch((error: Error) => setVisionError(error.message.replace(/^Error invoking remote method '[^']+': Error: /, ''))).finally(() => setVisionBusy(false))
      }}>{visionBusy ? 'Capturing…' : 'Capture now'}</button>
      {mac && <>
        <button className="button secondary" type="button" disabled={busy || pickerBusy || share === 'sharing' || !live.draftVisionActive}
          onClick={() => void act(async () => await api.requestDraftScreenRecording() ? 'Screen Recording access is available.'
            : 'If macOS still shows access enabled, follow Reset instructions or share the Dota window.')}>Request Screen Recording</button>
        <button className="text-button" type="button" onClick={() => void act(() => api.openExternal('screenRecording'))}>Open Screen Recording settings <ArrowUpRight size={14} /></button>
      </>}
    </div>
    <Feedback {...feedback} />
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
      {live.settings.features.learning && context.accountId && visionResult.trainable.some(Boolean) && <details>
        <summary>Teach a cosmetic portrait</summary>
        <p className="fine-print">Label a visible Arcana, Persona, or other portrait. The app remembers the small portrait sample on this device.</p>
        <div className="actions">
          <label className="field">Portrait slot<select value={portraitSlot} disabled={portraitSaving} onChange={(event) => { setPortraitSlot(event.target.value); setPortraitMessage('') }}>
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
  </section>
}
