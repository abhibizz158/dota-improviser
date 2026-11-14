import { useEffect, useId, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, BrainCircuit, Clock3, Gamepad2, Minus, Radio, Shield, Swords, Trophy, X } from 'lucide-react'
import type { DraftInput, GameType, GameView, Hero, LiveSettings, LiveState, Role, Toast } from '../shared/model.js'
import { gameTypes, roleLabels, roles } from '../shared/model.js'
import { aegisView, clockText as roshanClock, roshanView } from '../shared/roshan.js'
import type { RoshanState } from '../shared/roshan.js'
import type { CoachingContext } from '../shared/contextual-coach.js'
import type { Metric, PersonalPerformance } from '../shared/personal-performance.js'
import type { CoachView } from '../shared/coach.js'
import type { Support } from '../shared/guide.js'
import type { Tip } from '../shared/coach.js'
import type { ItemRecommendation } from '../shared/item-coaching.js'
import type { ItemInfo } from '../shared/items.js'
import type { Recovery } from '../shared/live-coach.js'
import itemCatalog from 'virtual:dota-items'
import { OutlookCard } from './match-outlook'

const base = import.meta.env.BASE_URL
const bundled = new Set(Object.keys(import.meta.glob('../../public/heroes/*.png')).map((path) => path.split('/').at(-1)?.replace('.png', '')))
const CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/'
const renderTip = (tip: Tip) => <div key={tip.text} className={'tip ' + tip.level}>{tip.text}{tip.items?.length ? <div className="tip-items" aria-label="Suggested defensive items">{tip.items.map((key) => {
  const item = (itemCatalog as Record<string, ItemInfo>)[key]
  const stage = item ? (item.c < 1200 ? 'early' : item.c < 3200 ? 'core' : 'late') : 'early'
  return <span key={key}><b>{item?.n ?? key.replaceAll('_', ' ')}</b><small>{stage} · {item?.c?.toLocaleString('en-US') ?? 'cost varies'}</small></span>
})}</div> : null}</div>
/** Image sources in order of preference; every one is tried before falling back to an initials badge. */
const portraitSources = (slug: string) => [
  ...(bundled.has(slug) ? [base + 'heroes/' + slug + '.png'] : []),
  CDN + 'dota_react/heroes/' + slug + '.png', CDN + 'heroes/' + slug + '_lg.png', CDN + 'heroes/' + slug + '_sb.png',
]
export const heroPortrait = (hero: Hero) => portraitSources(hero.slug)[0]

function PortraitImg({ hero }: { hero: Hero }) {
  const sources = portraitSources(hero.slug)
  const [i, setI] = useState(0)
  if (i >= sources.length) {
    const initials = hero.name.split(/[\s-]+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    return <span className="monogram" style={{ ['--h' as string]: (hero.id * 47) % 360 }} aria-hidden="true">{initials}</span>
  }
  return <img src={sources[i]} alt="" loading="lazy" onError={() => setI(i + 1)} />
}

export function Portrait({ hero, className = '' }: { hero?: Hero; className?: string }) {
  return <span className={'portrait ' + className}>{hero ? <PortraitImg key={hero.slug} hero={hero} /> : <Swords size={18} />}</span>
}

export const fmt = (number: number | null | undefined, digits = 0) => number == null ? '—' : number.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })
export function clock(time: number | null) {
  if (time == null) return '—'
  const whole = Math.floor(Math.abs(time))
  return (time < 0 ? '−' : '') + Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2, '0')
}

export function Feedback({ message, error = false }: { message?: string; error?: boolean }) {
  return message ? <div className={'feedback ' + (error ? 'is-error' : '')} role={error ? 'alert' : 'status'}>{message}</div> : null
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><Gamepad2 size={26} /><strong>{title}</strong>{children && <p>{children}</p>}</div>
}

export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const id = useId()
  return <dialog ref={(element) => { if (element && !element.open) element.showModal() }} aria-labelledby={id}
    onCancel={(event) => { event.preventDefault(); onClose() }} className="dialog">
    <div className="dialog-title"><h2 id={id}>{title}</h2><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
    {children}
  </dialog>
}

export function Trend({ value, suffix = '', digits = 0 }: { value: number | null; suffix?: string; digits?: number }) {
  if (value == null) return <span className="trend neutral"><Minus size={12} /> No comparison</span>
  const rounded = Number(value.toFixed(digits))
  return <span className={'trend ' + (rounded === 0 ? 'neutral' : rounded > 0 ? 'positive' : 'negative')}>
    {rounded === 0 ? <Minus size={12} /> : rounded > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{fmt(Math.abs(rounded), digits)}{suffix}</span>
}

export function LaneCard({ live, preview = false, hero }: { live: LiveState; preview?: boolean; hero?: Hero }) {
  const lane = preview ? { clock: 433, lastHits: 44, denies: 8, deaths: 1, level: 7, paused: false, heroSlug: 'phantom_assassin' } : live.lane
  const displayName = hero?.name ?? (preview ? 'Phantom Assassin' : 'Own-player stats')
  const pace = preview ? [{ minute: 5, lastHits: 30, matches: 4 }, { minute: 10, lastHits: 66, matches: 4 }] : live.pace
  const offset = lane ? ((lane.clock % 60) + 60) % 60 : 0
  const cue = !preview && live.settings.cues && lane && !lane.paused && lane.clock >= 60
    ? offset >= 53 && offset <= 55 ? 'Stack practice window' : offset >= 14 && offset <= 17 ? 'Pull practice window' : '' : ''
  return <article className={'lane-card ' + (live.settings.size === 'Large' ? 'lane-large' : '')}>
    <div className="lane-head">
      <span className="lane-signal"><Radio size={15} /> {preview ? 'Preview' : lane ? (lane.paused ? 'Paused' : 'Practice') : live.status}</span>
      <span className="lane-clock"><Clock3 size={15} />{clock(lane?.clock ?? null)}</span>
    </div>
    <div className="lane-hero">{displayName}</div>
    <div className="lane-stats">{[['Last hits', lane?.lastHits], ['Denies', lane?.denies], ['Deaths', lane?.deaths], ['Level', lane?.level]].map(([label, value]) =>
      <span key={label}><strong>{fmt(value as number | null)}</strong><small>{label}</small></span>)}</div>
    {pace.length > 0 && <div className="lane-pace" title="Average last hits across comparable saved matches">
      {pace.map((point) => {
        const current = preview && point.minute === 5 ? 33 : live.checkpoints.find((entry) => entry.minute === point.minute)?.lastHits
        const delta = current == null ? null : current - point.lastHits
        return <span key={point.minute}>{point.minute}m target <b>{point.lastHits} LH</b> <small>({point.matches})</small>
          {delta != null && <strong className={delta >= 0 ? 'positive' : 'negative'}> {delta > 0 ? '+' : ''}{delta}</strong>}</span>
      })}
    </div>}
    {cue && <div className="lane-cue">{cue}</div>}
  </article>
}

const isMac = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')
const mod = isMac ? '⌘⇧' : 'Ctrl+Shift+'
function Head({ icon, tag, sub }: { icon: ReactNode; tag: string; sub?: string }) {
  return <div className="card-head"><span className="tag"><img className="card-logo" src={base + 'logo.svg'} alt="" width={16} height={16} />{icon}{tag}</span>{sub && <span className="sub">{sub}</span>}</div>
}
const Foot = ({ children }: { children: ReactNode }) => <div className="card-foot">{children}</div>

export function WinMeter({ allied, enemy }: { allied: number | null; enemy?: never }) {
  if (allied == null) return null
  const a = Math.round(allied * 10) / 10
  return <div className="ov-prob"><header><span>Estimated lineup edge (pair win rates)</span><b>{fmt(a, 1)}%</b></header>
    <div className="meter"><i style={{ width: a + '%' }} /><i style={{ width: 100 - a + '%' }} /></div></div>
}

function Team({ label, tone, ids, byId, remove }: { label: string; tone: 'a' | 'e'; ids: number[]; byId: (id: number) => Hero | undefined; remove?: (id: number) => void }) {
  return <div className="ov-team"><span className={'lbl ' + tone}>{label}</span>
    {ids.map((id) => <span className="ov-pick" key={id} title={byId(id)?.name}><Portrait hero={byId(id)} />
      {remove && <button aria-label="Remove" onClick={() => remove(id)}>×</button>}</span>)}
    {!ids.length && <small>{tone === 'e' ? 'none revealed' : 'none'}</small>}</div>
}

/** Overlay draft card. Passive = click-through read-out; interactive (Ctrl/⌘+Shift+O) = type a hero, Enter=enemy, Shift+Enter=ally. */
export function DraftCard({ live, heroes, send, done }: { live: LiveState; heroes: Hero[]; send?: (input: DraftInput) => Promise<unknown>; done?: () => Promise<void> }) {
  const [query, setQuery] = useState('')
  const { draft, interactive } = live
  const heroLookup = useMemo(() => new Map(heroes.map((hero) => [hero.id, hero])), [heroes])
  const byId = (id: number) => heroLookup.get(id)
  const matches = useMemo(() => {
    const input = query.trim().toLowerCase()
    if (!input) return []
    const taken = new Set([...draft.enemy, ...draft.allied, ...draft.bans, draft.ownHero])
    return heroes.filter((hero) => !taken.has(hero.id) && hero.name.toLowerCase().includes(input)).slice(0, 5)
  }, [query, heroes, draft.enemy, draft.allied, draft.bans, draft.ownHero])
  const pick = (ally: boolean, hero = matches[0]) => {
    if (!hero || !send) return
    setQuery('')
    void send(ally ? { allied: [...draft.allied, hero.id] } : { enemy: [...draft.enemy, hero.id] }).catch(() => {})
  }
  const canEdit = interactive && send
  useEffect(() => { if (!interactive) setQuery('') }, [interactive])
  const compact = live.settings.size === 'Compact' && !canEdit
  const f = live.settings.features, detailed = live.settings.detailed
  const reason = (item: (typeof draft.suggestions)[number]) => {
    const mechanic = item.why.find((pair) => pair.reason)?.reason
    const best = item.why.reduce<(typeof item.why)[number] | undefined>((strongest, pair) =>
      pair.edge > 0 && (pair.games >= 60 || pair.source === 'mechanics') && (!strongest || pair.edge > strongest.edge) ? pair : strongest, undefined)
    return mechanic ?? (best ? `Good against ${byId(best.enemy)?.name ?? 'revealed enemy'}` : item.synergy ?? `Fits ${roleLabels[draft.role].toLowerCase()}`)
  }
  const locked = draft.lockedHero != null
  const statusText = locked ? 'Hero locked' : draft.activeTeam && live.pick ? (draft.activeTeam === live.pick.team ? 'Your team picking' : 'Enemy team picking') : 'Pick suggestions'
  return <article className="draft-card">
    {canEdit && <div className="overlay-edit"><span>Editing draft picks</span><button type="button" onClick={() => void done?.()}>Done <kbd>Esc</kbd></button></div>}
    <Head icon={<Swords size={13} />} tag={statusText} sub={roleLabels[draft.role] + (!locked && draft.timeLeft != null ? ' · ' + Math.round(draft.timeLeft) + 's' : '')} />
    {draft.ownHero != null && <div className="ov-team you"><span className="lbl you">You</span><span className="ov-pick" title={byId(draft.ownHero)?.name}><Portrait hero={byId(draft.ownHero)} />{byId(draft.ownHero)?.name}</span></div>}
    <Team label="Enemy" tone="e" ids={draft.enemy} byId={byId} remove={canEdit ? (id) => void send({ enemy: draft.enemy.filter((x) => x !== id) }) : undefined} />
    <Team label="Teammates" tone="a" ids={draft.allied} byId={byId} remove={canEdit ? (id) => void send({ allied: draft.allied.filter((x) => x !== id) }) : undefined} />
    {f.bans && draft.bans.length > 0 && <div className="ov-team bans"><span className="lbl">Bans</span>{draft.bans.slice(0, 10).map((id) => <Portrait key={id} hero={byId(id)} />)}</div>}
    {canEdit && <label className="overlay-role"><span>Your role</span>
      <select value={draft.roleChoice.source === 'Manual' ? draft.role : ''} onChange={(event) => void send({ role: event.target.value ? event.target.value as Role : null })}>
        <option value="">Auto ({roleLabels[draft.role]})</option>
        {roles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
      </select></label>}
    {f.winMeter && !locked && <WinMeter allied={draft.teamWin} />}
    {canEdit && <div className="draft-entry"><input autoFocus spellCheck={false} aria-label="Find hero to add" placeholder="Search heroes" value={query}
      onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') pick(event.shiftKey) }} />
      {matches.length > 0 && <div>{matches.map((hero) => <button type="button" key={hero.id} onClick={(event) => pick(event.shiftKey, hero)}>{hero.name}</button>)}</div>}
      <small>Click or Enter for enemy · hold Shift for ally</small></div>}
    {!locked && draft.suggestions.length > 0 && <ol className="draft-list">{draft.suggestions.slice(0, compact ? 3 : 5).map((item) => <li key={item.heroId}>
      <Portrait hero={byId(item.heroId)} />
      <div className="draft-candidate"><strong>{byId(item.heroId)?.name}</strong><span className="why">{reason(item)}</span>
        {detailed && !compact && item.synergy && item.synergy !== reason(item) && <span className="why">{item.synergy}</span>}</div>
      {item.winRate != null && item.games >= 60 && <span className={'wr ' + (item.winRate >= 50 ? 'positive' : 'negative')} title="Sample-weighted estimate against revealed enemies">{fmt(item.winRate, 1)}%</span>}
    </li>)}</ol>}
    {!locked && !draft.suggestions.length && <small className="draft-note">{draft.ownHero != null ? 'Clear your planned hero to compare other picks.' :
      draft.enemy.length || draft.allied.length ? 'No available heroes match this role and pool.' :
        'Waiting for visible picks. You can add a revealed hero with the draft shortcut.'}</small>}
    {!locked && draft.loading && <small className="draft-note">Updating matchup data…</small>}
    {f.hints && <Foot><kbd>{mod}O</kbd> type picks · <kbd>{mod}C</kbd> compact · <kbd>{mod}H</kbd> hide</Foot>}
  </article>
}

const tone = (p: number | null) => p == null ? 'var(--dim)' : p >= 66 ? 'var(--good)' : p >= 33 ? 'var(--gold)' : 'var(--bad)'
function Pace({ label, value, median, pct }: { label: string; value: string; median?: string; pct: number | null }) {
  return <div className="pace-row"><span>{label} <em>{value}{median ? ' / ' + median : ''}</em></span><div className="meter"><i style={{ width: (pct ?? 0) + '%', background: tone(pct) }} /></div><b>{pct == null ? '—' : Math.round(pct)}</b></div>
}
const toastIcon = (kind: string) => kind === 'first-blood' ? '🩸' : kind === 'multikill' ? '⚔' : kind === 'streak' ? '🔥' : (kind === 'item' || kind === 'comeback') ? '★' : kind === 'alert' ? '⚠' : kind === 'summary' ? '🏁' : '✓'

/** Animated achievement/alert banners. Each fades itself out via CSS; the overlay just stops receiving them once
 * TOAST_MS elapses. Several landing at once (a multikill plus a streak, say) stack instead of replacing each other. */
export function Toasts({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null
  return <div className="toasts" aria-live="polite">{toasts.slice(-4).map((t, index, all) => <div key={t.id + t.shownAt}
    className={'toast ' + t.kind + (t.epic ? ' epic' : '')} style={{ '--stack': all.length - 1 - index } as never}>
    <span className="toast-icon">{toastIcon(t.kind)}</span><div><b>{t.label}</b>{t.sub && <small>{t.sub}</small>}</div></div>)}</div>
}

/** Your team's kill lead over the game (the public team score), drawn like Dota's advantage graph. */
export function MomentumGraph({ points }: { points: [number, number][] }) {
  if (points.length < 2) return null
  const w = 220, h = 44, mid = h / 2
  const max = Math.max(3, ...points.map(([, v]) => Math.abs(v)))
  const x = (i: number) => 2 + i * (w - 4) / (points.length - 1), y = (v: number) => mid - v / max * (mid - 4)
  const line = points.map(([, v], i) => x(i) + ',' + y(v)).join(' ')
  const last = points.at(-1)![1]
  return <div className="momentum"><div className="momentum-head"><small>MOMENTUM · kill lead</small><b className={last >= 0 ? 'positive' : 'negative'}>{last > 0 ? '+' : ''}{last}</b></div>
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Kill lead over time" preserveAspectRatio="none">
      <line x1="0" x2={w} y1={mid} y2={mid} stroke="rgba(255,255,255,.14)" strokeDasharray="3 3" />
      <polygon points={`${x(0)},${mid} ${line} ${x(points.length - 1)},${mid}`} fill={last >= 0 ? 'rgba(107,191,89,.25)' : 'rgba(224,87,75,.25)'} />
      <polyline className="draw" pathLength={1} points={line} fill="none" stroke={last >= 0 ? 'var(--good)' : 'var(--bad)'} strokeWidth="2" strokeLinejoin="round" /></svg></div>
}

/** First blood, multi-kill tally and streak for this game. */
export function GameStrip({ game }: { game: GameView }) {
  const fb = game.firstBlood
  const multi = Object.entries(game.multi)
  if (!fb && !multi.length && game.streak < 3) return null
  return <div className="game-strip">
    {fb && <span className={'chip ' + (fb.you ? 'epic' : fb.team === game.team ? 'good' : 'bad')}>🩸 First blood · {fb.you ? 'you' : fb.team === game.team ? 'your team' : 'enemy'} · {Math.floor(fb.clock / 60)}:{String(fb.clock % 60).padStart(2, '0')}</span>}
    {multi.map(([name, n]) => <span key={name} className="chip epic">⚔ {name}{n > 1 ? ' ×' + n : ''}</span>)}
    {game.streak >= 3 && <span className="chip hot">🔥 {game.streak} streak</span>}
  </div>
}

const mmss = (t: number) => Math.floor(t / 60) + ':' + String(Math.round(t % 60)).padStart(2, '0')

/**
 * Roshan/Aegis stopwatch. Purely a countdown from a timestamp YOU set with a hotkey or button when you see Roshan
 * die — the app never reads Roshan's state from the game. Ticks on a 1s local interval only while a timer is
 * running, so it costs nothing when idle (no timer running, or window hidden and throttled by Electron).
 */
export function RoshanTimer({ roshan }: { roshan: RoshanState }) {
  const [, tick] = useState(0)
  const running = roshan.roshanAt != null || roshan.aegisAt != null
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [running])
  if (!running) return null
  const rosh = roshanView(roshan.roshanAt, Date.now()), aegis = aegisView(roshan.aegisAt, Date.now())
  return <div className="roshan-timer">
    {roshan.roshanAt != null && <span className={'chip ' + (rosh.state === 'open' ? 'hot' : rosh.state === 'unknown' ? '' : '')}>
      <Shield size={11} /> Roshan {rosh.state === 'waiting' ? 'in ' + roshanClock(rosh.minLeft!) : rosh.state === 'open' ? 'may be up' : 'window passed'}</span>}
    {roshan.aegisAt != null && !aegis.expired && <span className="chip epic"><Shield size={11} /> Aegis {roshanClock(aegis.left!)}</span>}
  </div>
}

const performanceLabels: Record<Metric, string> = {
  gpm: 'GPM', xpm: 'XPM', lastHits: 'Last hits', deaths: 'Survival', level: 'Level', participation: 'Fight involvement', items: 'Item progress',
}
function PerformanceMeter({ performance, detailed }: { performance: PersonalPerformance; detailed: boolean }) {
  const current = performance.points.at(-1)
  return <section className="personal-meter" aria-label="Personal performance">
    <div className="personal-meter-heading"><strong>Vs. your past matches</strong><b>{current?.score == null ? '—' : `${current.score}/100`}</b></div>
    {current?.score != null ? <>
      <meter aria-label="Personal performance score" min={0} max={100} value={current.score} />
      <small>{current.at / 60}:00 · {current.matches} prior matches</small>
    </> : <small>{current ? `Need more match data at ${current.at / 60}:00` : 'First checkpoint at 5:00'}</small>}
    {detailed && current?.metrics.length ? <div className="personal-metrics">{current.metrics.map(({ key, score }) =>
      <span key={key}>{performanceLabels[key]} <b>{score}</b></span>)}</div> : null}
    {detailed && performance.points.length > 1 && <div className="personal-checkpoints" aria-label="Recent checkpoints">
      {performance.points.slice(-4).map((point) => <span key={point.at}>{point.at / 60}:00 <b>{point.score ?? '—'}</b></span>)}
    </div>}
  </section>
}

function MatchItems({ items, compact }: { items: ItemRecommendation[]; compact?: boolean }) {
  return <section className="match-items" aria-label="Matchup items">
    {items.slice(0, compact ? 1 : 2).map((item) => <div key={item.key}>
      <header><b>{item.name}</b><small>{item.timing}</small></header>
      <p>{item.reason}</p><small>{item.goal}</small>
    </div>)}
  </section>
}

/** Live coach: percentile score vs this hero's benchmarks, goals, tips, achievements. Own-player GSI data only. Detail mode (Settings) adds stats and medians. */
export function CoachCard({ coach, heroName, clockText, support, heroes = [], settings, game, performance, coaching, compact = false, recoveryMode = false }: { coach: CoachView; heroName: string; clockText: string; support?: Support | null; heroes?: Hero[]; settings: LiveSettings; game?: GameView | null; performance?: PersonalPerformance; coaching?: CoachingContext; compact?: boolean; recoveryMode?: boolean }) {
  const f = settings.features, s = coach.stats
  // Phase-adaptive layout: laning = lane tools, mid game = goals + momentum, late game = essentials only.
  const adaptive = f.phaseAdaptive, late = adaptive && coach.phase === 'Late game', laning = !adaptive || coach.phase === 'Laning'
  const detailed = settings.detailed && !late
  const contextualTips = coaching?.tips ?? coach.tips
  const outlook = !recoveryMode && f.matchOutlook ? game?.outlook : undefined
  const items = !recoveryMode && f.itemCoach ? coaching?.items ?? [] : []
  const primaryTip = (f.coachTips ? contextualTips.find((tip) => tip.level === 'warn') ?? contextualTips[0] : undefined) ??
    (f.laneWatch ? support?.tips[0] : undefined)
  const med = (v: number | null, d = 0) => v == null ? undefined : fmt(v, d)
  if (compact) return <article className="coach-card compact-coach">
    <Head icon={<Trophy size={13} />} tag={heroName} sub={clockText} />
    {outlook && <OutlookCard outlook={outlook} compact />}
    {!recoveryMode && performance && <PerformanceMeter performance={performance} detailed={false} />}
    <div className="stat-row">
      <span><b>{fmt(s.lastHits)}/{fmt(s.denies)}</b><small>LH/DN</small></span><span><b>{fmt(s.deaths)}</b><small>Deaths</small></span>
      <span><b>{fmt(s.level)}</b><small>Level</small></span><span><b>{fmt(coach.gpm)}</b><small>GPM</small></span>
    </div>
    {items.length > 0 && <MatchItems items={items} compact />}
    {detailed && primaryTip && (!items.length || primaryTip.level === 'warn') && <div className="tips">{renderTip(primaryTip)}</div>}
    {detailed && coach.benchmarkLabel && <small className="draft-note">{coach.benchmarkLabel} · {coach.role.includes('support') ? 'support' : 'core'} benchmarks</small>}
    {detailed && !primaryTip && coach.nextGoal && f.achievements && <div className="next-goal"><b>{coach.nextGoal.label}</b><em>{mmss(coach.nextGoal.left)} left</em></div>}
  </article>
  return <article className="coach-card">
    <Head icon={<Trophy size={13} />} tag={'Coach · ' + heroName} sub={(coach.matchmaking ? 'Matchmaking' : 'Practice') + ' · ' + coach.phase + ' · ' + clockText} />
    {outlook && <OutlookCard outlook={outlook} />}
    {!recoveryMode && performance && <PerformanceMeter performance={performance} detailed={detailed} />}
    {coach.role && <span className="role-chip">{roleLabels[coach.role]}{adaptive ? ' · adaptive view' : ''}</span>}
    <div className="coach-top">
      <div className="score-ring" style={{ ['--v' as string]: coach.score ?? 0, ['--c' as string]: tone(coach.score) }}><span>{coach.score ?? '—'}</span></div>
      <div><Pace label="GPM" value={fmt(coach.gpm)} median={detailed ? med(coach.medians.gpm) : undefined} pct={coach.gpmPct} />
        <Pace label="XPM" value={fmt(coach.xpm)} median={detailed ? med(coach.medians.xpm) : undefined} pct={coach.xpmPct} />
        <Pace label="LH/m" value={fmt(coach.lhpm, 1)} median={detailed ? med(coach.medians.lhpm, 1) : undefined} pct={coach.lhPct} /></div>
    </div>
    {f.coachTips && coaching && <div className="coach-context">
      <div className="coach-context-stats">
        {coaching.bracket && <small title={coaching.bracket.games.toLocaleString() + ' public games'}>{coaching.bracket.name} · {coaching.bracket.rate}% overall</small>}
        {coaching.matchup && <small title={coaching.matchup.games.toLocaleString() + ' public games'}>vs. {coaching.matchup.name} · {coaching.matchup.rate}%</small>}
      </div>
      <div className="tips">{coaching.tips.slice(0, detailed ? 4 : 2).map(renderTip)}</div>
    </div>}
    {items.length > 0 && <MatchItems items={items} />}
    {!recoveryMode && game && <GameStrip game={game} />}
    {!recoveryMode && f.momentum && game && game.momentum.length > 1 && (!adaptive || coach.phase !== 'Laning' || game.momentum.length > 4) && <MomentumGraph points={game.momentum} />}
    {detailed && <div className="stat-row">
      <span><b>{fmt(s.kills)}/{fmt(s.deaths)}/{fmt(s.assists)}</b><small>K/D/A</small></span><span><b>{fmt(s.lastHits)}/{fmt(s.denies)}</b><small>LH/DN</small></span>
      <span><b>{fmt(s.level)}</b><small>LEVEL</small></span><span className={(s.gold ?? 0) >= 1500 ? 'warn' : ''}><b>{fmt(s.gold)}</b><small>GOLD</small></span></div>}
    {!recoveryMode && !!coach.planned?.length && <div className="coach-plan">
      <small>APPROVED BUILD</small>
      <span>{coach.planned.find((item) => item.at == null)?.name ?? 'All planned items seen'}</span>
      <small>{coach.planned.filter((item) => item.at != null).length}/{coach.planned.length} seen</small>
    </div>}
    {!recoveryMode && coach.nextGoal && f.achievements && <div className="next-goal"><small>NEXT GOAL</small><b>{coach.nextGoal.label}</b><em>{mmss(coach.nextGoal.left)} left</em></div>}
    {!recoveryMode && f.laneWatch && laning && support && support.matchups.length > 0 && <div className="lane-watch"><small>LANE WATCH · you vs revealed enemies</small>
      <div>{support.matchups.map((m) => <span key={m.enemy} className={m.rate >= 52 ? 'good' : m.rate < 48 ? 'bad' : ''} title={heroes.find((h) => h.id === m.enemy)?.name}><Portrait hero={heroes.find((h) => h.id === m.enemy)} />{fmt(m.rate, 0)}%</span>)}</div></div>}
    {!recoveryMode && f.laneWatch && !coaching && support && support.tips.length > 0 && <div className="tips">{support.tips.slice(0, detailed ? 3 : 1).map(renderTip)}</div>}
    {!recoveryMode && f.coachTips && !coaching && coach.tips.length > 0 && <div className="tips">{coach.tips.slice(0, detailed ? 3 : 1).map(renderTip)}</div>}
    {!recoveryMode && f.achievements && !late && coach.achievements.length > 0 && <div className="ach">{coach.achievements.map((a) => <span key={a.id} className={a.state}>{a.elite ? '★' : a.state === 'done' ? '✓' : a.state === 'late-done' ? '•' : a.state === 'live' ? '◔' : '×'} {a.label}</span>)}</div>}
    {!recoveryMode && f.personal && coach.personal && <small className="draft-note">Your avg on this hero: {coach.personal.gpm} GPM · {coach.personal.xpm} XPM ({coach.personal.n} games, patch-weighted)</small>}
    {!recoveryMode && !coach.benchmarkAvailable && <small className="draft-note">No benchmark data for this hero yet. Open Heroes → Update data now.</small>}
    {!recoveryMode && f.hints && <Foot>{coach.benchmarkLabel ? `Public benchmark · ${coach.benchmarkLabel} ${coach.role.includes('support') ? 'supports' : 'cores'}` : 'Public hero benchmark'} · <kbd>{mod}C</kbd> compact · <kbd>{mod}H</kbd> hide</Foot>}
  </article>
}

/** A next step while dead: role- and build-aware, from your own practice feed. Never reads whether or where the game will let you respawn. */
export function RecoveryCard({ recovery }: { recovery: Recovery }) {
  return <article className="recovery-card">
    <Head icon={<Clock3 size={13} />} tag="Respawn coach" sub={recovery.seconds != null ? clock(recovery.seconds) + ' left' : ''} />
    {recovery.threat && <small className="draft-note">{recovery.threat}</small>}
    <b>{recovery.title}</b><p>{recovery.tip}</p>
    {recovery.followUp && <p>{recovery.followUp}</p>}
    {Boolean(recovery.repeats) && <small className="draft-note">Similar deaths in your history · {recovery.repeats}</small>}
  </article>
}

/** Floating assistant: ask Puter AI about the current draft or practice game. Opened with Ctrl/⌘+Shift+O once a game is live.
 * Rendered in the overlay's big, interactive, click-through-off window (same sizing as the draft editor). */
export function AssistantCard({ ask, done }: { ask?: (question: string) => Promise<string>; done?: () => Promise<void> }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = () => {
    const text = question.trim()
    if (!ask || !text || busy) return
    setBusy(true); setError('')
    void ask(text).then((value) => { setAnswer(value); setQuestion('') }).catch((reason: Error) => setError(reason.message)).finally(() => setBusy(false))
  }
  return <article className="assistant-card reveal big-prompt">
    <Head icon={<BrainCircuit size={13} />} tag="Ask the coach" sub="Puter AI" />
    <textarea autoFocus rows={5} value={question} placeholder="Ask about this draft or your practice game…"
      onChange={(event) => setQuestion(event.target.value)}
      onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() } }} />
    <div className="assistant-actions">
      <button type="button" className="button primary slim" disabled={busy || !question.trim()} onClick={submit}>{busy ? 'Thinking…' : 'Ask'}</button>
      {done && <button type="button" className="button secondary slim" onClick={() => void done()}>Done <kbd>Esc</kbd></button>}
    </div>
    {error && <small className="draft-note">{error}</small>}
    {answer && <div className="assistant-answer">{answer.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}</div>}
  </article>
}

/** Shown once per game in the overlay's big interactive window: GSI never reliably reports lane or game type,
 * so the player picks both. Answering (or Escape to skip) returns the overlay to its normal compact size. */
export function SessionPrompt({ onSubmit, onSkip, initial, submitLabel = 'Start coaching' }: {
  onSubmit?: (gameType: GameType, lane: Role) => Promise<unknown>; onSkip?: () => Promise<unknown>;
  initial?: LiveState['sessionInfo']; submitLabel?: string
}) {
  const [gameType, setGameType] = useState<GameType | null>(initial?.gameType ?? null)
  const [lane, setLane] = useState<Role | null>(initial?.lane ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = (action: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    setError('')
    void action().catch((reason: unknown) => setError(reason instanceof Error
      ? reason.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Could not save your match setup. Try again.')).finally(() => setBusy(false))
  }
  return <article className="assistant-card big-prompt session-prompt" aria-label="Match setup">
    <Head icon={<Gamepad2 size={14} />} tag="This game" />
    <fieldset className="session-prompt-group" disabled={busy}>
      <legend>Game type</legend>
      <div className="session-prompt-options">{gameTypes.map((option) => <button type="button" key={option} aria-pressed={gameType === option}
        className={'button slim' + (gameType === option ? ' primary' : ' secondary')} onClick={() => setGameType(option)}>{option}</button>)}</div>
    </fieldset>
    <fieldset className="session-prompt-group" disabled={busy}>
      <legend>Your lane</legend>
      <div className="session-prompt-options">{roles.map((option) => <button type="button" key={option} aria-pressed={lane === option}
        className={'button slim' + (lane === option ? ' primary' : ' secondary')} onClick={() => setLane(option)}>{roleLabels[option]}</button>)}</div>
    </fieldset>
    <Feedback message={error} error />
    <div className="assistant-actions">
      <button type="button" className="button primary" disabled={!onSubmit || !gameType || !lane || busy}
        onClick={() => { if (onSubmit && gameType && lane) save(() => onSubmit(gameType, lane)) }}>{busy ? 'Saving…' : submitLabel}</button>
      {onSkip && <button type="button" className="button secondary" disabled={busy} onClick={() => save(onSkip)}>Skip</button>}
    </div>
  </article>
}
