import { useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, Clock3, Gamepad2, Minus, Radio, Shield, Swords, Trophy, X } from 'lucide-react'
import type { DraftInput, GameView, Hero, LiveSettings, LiveState, Toast } from '../shared/model.js'
import { aegisView, clockText as roshanClock, roshanView } from '../shared/roshan.js'
import type { RoshanState } from '../shared/roshan.js'
import type { CoachView } from '../shared/coach.js'
import type { Support } from '../shared/guide.js'
import type { Tip } from '../shared/coach.js'
import type { ItemInfo } from '../shared/items.js'
import itemCatalog from 'virtual:dota-items'

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

function Team({ label, tone, ids, heroes, remove }: { label: string; tone: 'a' | 'e'; ids: number[]; heroes: Hero[]; remove?: (id: number) => void }) {
  return <div className="ov-team"><span className={'lbl ' + tone}>{label}</span>
    {ids.map((id) => <span className="ov-pick" key={id} title={heroes.find((h) => h.id === id)?.name}><Portrait hero={heroes.find((h) => h.id === id)} />
      {remove && <button aria-label="Remove" onClick={() => remove(id)}>×</button>}</span>)}
    {!ids.length && <small>{tone === 'e' ? 'none revealed' : 'none'}</small>}</div>
}

/** Overlay draft card. Passive = click-through read-out; interactive (Ctrl/⌘+Shift+F9) = type a hero, Enter=enemy, Shift+Enter=ally. */
export function DraftCard({ live, heroes, send }: { live: LiveState; heroes: Hero[]; send?: (input: DraftInput) => Promise<unknown> }) {
  const [query, setQuery] = useState('')
  const { draft, interactive } = live
  const byId = (id: number) => heroes.find((hero) => hero.id === id)
  const taken = new Set([...draft.enemy, ...draft.allied, ...draft.bans])
  const matches = query.length > 0 ? heroes.filter((hero) => !taken.has(hero.id) && hero.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5) : []
  const pick = (ally: boolean) => {
    const hero = matches[0]
    if (!hero || !send) return
    setQuery('')
    void send(ally ? { allied: [...draft.allied, hero.id] } : { enemy: [...draft.enemy, hero.id] }).catch(() => {})
  }
  const canEdit = interactive && send
  const f = live.settings.features, detailed = live.settings.detailed
  const reason = (item: (typeof draft.suggestions)[number]) => { const best = [...item.why].sort((a, b) => b.rate - a.rate)[0]; return best ? 'best vs ' + (byId(best.enemy)?.name ?? 'enemy') + ' ' + fmt(best.rate * 100, 0) + '% (' + best.source + ')' + (draft.patched.includes(item.heroId) ? ' · patched recently' : '') : '' }
  return <article className="draft-card">
    <Head icon={<Swords size={13} />} tag={'Draft' + (draft.activeTeam ? ' · ' + draft.activeTeam + ' picking' : '')} sub={draft.role + (draft.timeLeft != null ? ' · ' + Math.round(draft.timeLeft) + 's' : '')} />
    <Team label="Enemy" tone="e" ids={draft.enemy} heroes={heroes} remove={canEdit ? (id) => void send({ enemy: draft.enemy.filter((x) => x !== id) }) : undefined} />
    <Team label="Allies" tone="a" ids={draft.allied} heroes={heroes} remove={canEdit ? (id) => void send({ allied: draft.allied.filter((x) => x !== id) }) : undefined} />
    {f.bans && draft.bans.length > 0 && <div className="ov-team bans"><span className="lbl">Bans</span>{draft.bans.slice(0, 10).map((id) => <Portrait key={id} hero={byId(id)} />)}</div>}
    {f.winMeter && <WinMeter allied={draft.teamWin} />}
    {canEdit && <div className="draft-entry"><input autoFocus spellCheck={false} placeholder="Hero · Enter enemy · Shift+Enter ally · F9 click-through" value={query}
      onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') pick(event.shiftKey) }} />
      {matches.length > 0 && <div>{matches.map((hero) => <span key={hero.id}>{hero.name}</span>)}</div>}</div>}
    <ol className="draft-list">{draft.suggestions.slice(0, 5).map((item, index) => <li key={item.heroId}>
      <span className="rank">{index + 1}</span><Portrait hero={byId(item.heroId)} /><strong>{byId(item.heroId)?.name}</strong>
      <span className={'wr ' + (item.score >= 0 ? 'positive' : 'negative')}>{item.winRate == null ? '—' : fmt(item.winRate, 1) + '%'}</span>
      <small>{item.comfort != null ? 'you ' + (item.comfort >= 0 ? '+' : '') + fmt(item.comfort, 0) : item.why[0]?.source}</small>
      {detailed && <em className="why">{reason(item)}</em>}
      <i className="bar" style={{ width: Math.min(100, Math.max(4, ((item.winRate ?? 50) - 44) * 6)) + '%' }} /></li>)}</ol>
    {detailed && draft.model.samples > 0 && <small className="draft-note">Learning from {draft.model.samples} of your matches · comfort weight {draft.model.comfortWeight}</small>}
    {!draft.suggestions.length && <small className="draft-note">{draft.enemy.length ? 'Computing…' : 'Waiting for enemy picks.'}</small>}
    {(draft.stale || draft.patchChanged || draft.loading) && <small className="draft-note">{draft.patchChanged ? 'New patch: data refreshing' : draft.stale ? 'Seed predates this build' : 'Refreshing live data…'}</small>}
    {f.hints && <Foot><kbd>{mod}F9</kbd> type picks · <kbd>{mod}F8</kbd> detail · <kbd>{mod}F10</kbd> hide</Foot>}
  </article>
}

const tone = (p: number | null) => p == null ? 'var(--dim)' : p >= 66 ? 'var(--good)' : p >= 33 ? 'var(--gold)' : 'var(--bad)'
function Pace({ label, value, median, pct }: { label: string; value: string; median?: string; pct: number | null }) {
  return <div className="pace-row"><span>{label} <em>{value}{median ? ' / ' + median : ''}</em></span><div className="meter"><i style={{ width: (pct ?? 0) + '%', background: tone(pct) }} /></div><b>{pct == null ? '—' : Math.round(pct)}</b></div>
}
const toastIcon = (kind: string) => kind === 'first-blood' ? '🩸' : kind === 'multikill' ? '⚔' : kind === 'streak' ? '🔥' : kind === 'item' ? '★' : '✓'

/** Animated achievement banners. Each fades itself out via CSS; the overlay just stops receiving them after 8s. */
export function Toasts({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null
  return <div className="toasts" aria-live="polite">{toasts.slice(-3).map((t) => <div key={t.id + t.shownAt} className={'toast ' + t.kind + (t.epic ? ' epic' : '')}>
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

/** Live coach: percentile score vs this hero's benchmarks, goals, tips, achievements. Own-player GSI data only. Detail mode (F8) adds stats and medians. */
export function CoachCard({ coach, heroName, clockText, support, heroes = [], settings, game }: { coach: CoachView; heroName: string; clockText: string; support?: Support | null; heroes?: Hero[]; settings: LiveSettings; game?: GameView | null }) {
  const f = settings.features, s = coach.stats
  // Phase-adaptive layout: laning = lane tools, mid game = goals + momentum, late game = essentials only.
  const adaptive = f.phaseAdaptive, late = adaptive && coach.phase === 'Late game', laning = !adaptive || coach.phase === 'Laning'
  const detailed = settings.detailed && !late
  const med = (v: number | null, d = 0) => v == null ? undefined : fmt(v, d)
  return <article className="coach-card">
    <Head icon={<Trophy size={13} />} tag={'Coach · ' + heroName} sub={coach.phase + ' · ' + clockText} />
    {coach.role && <span className="role-chip">{coach.role}{adaptive ? ' · adaptive view' : ''}</span>}
    <div className="coach-top">
      <div className="score-ring" style={{ ['--v' as string]: coach.score ?? 0, ['--c' as string]: tone(coach.score) }}><span>{coach.score ?? '—'}</span></div>
      <div><Pace label="GPM" value={fmt(coach.gpm)} median={detailed ? med(coach.medians.gpm) : undefined} pct={coach.gpmPct} />
        <Pace label="XPM" value={fmt(coach.xpm)} median={detailed ? med(coach.medians.xpm) : undefined} pct={coach.xpmPct} />
        <Pace label="LH/m" value={fmt(coach.lhpm, 1)} median={detailed ? med(coach.medians.lhpm, 1) : undefined} pct={coach.lhPct} /></div>
    </div>
    {game && <GameStrip game={game} />}
    {f.momentum && game && game.momentum.length > 1 && (!adaptive || coach.phase !== 'Laning' || game.momentum.length > 4) && <MomentumGraph points={game.momentum} />}
    {detailed && <div className="stat-row">
      <span><b>{fmt(s.kills)}/{fmt(s.deaths)}/{fmt(s.assists)}</b><small>K/D/A</small></span><span><b>{fmt(s.lastHits)}/{fmt(s.denies)}</b><small>LH/DN</small></span>
      <span><b>{fmt(s.level)}</b><small>LEVEL</small></span><span className={(s.gold ?? 0) >= 1500 ? 'warn' : ''}><b>{fmt(s.gold)}</b><small>GOLD</small></span></div>}
    {!!coach.planned?.length && <div className="coach-plan">
      <small>APPROVED BUILD</small>
      <span>{coach.planned.find((item) => item.at == null)?.name ?? 'All planned items seen'}</span>
      <small>{coach.planned.filter((item) => item.at != null).length}/{coach.planned.length} seen</small>
    </div>}
    {coach.nextGoal && f.achievements && <div className="next-goal"><small>NEXT GOAL</small><b>{coach.nextGoal.label}</b><em>{mmss(coach.nextGoal.left)} left</em></div>}
    {f.laneWatch && laning && support && support.matchups.length > 0 && <div className="lane-watch"><small>LANE WATCH · you vs revealed enemies</small>
      <div>{support.matchups.map((m) => <span key={m.enemy} className={m.rate >= 52 ? 'good' : m.rate < 48 ? 'bad' : ''} title={heroes.find((h) => h.id === m.enemy)?.name}><Portrait hero={heroes.find((h) => h.id === m.enemy)} />{fmt(m.rate, 0)}%</span>)}</div></div>}
    {f.laneWatch && support && support.tips.length > 0 && <div className="tips">{support.tips.slice(0, detailed ? 3 : 1).map(renderTip)}</div>}
    {f.coachTips && coach.tips.length > 0 && <div className="tips">{coach.tips.slice(0, detailed ? 3 : 1).map(renderTip)}</div>}
    {f.achievements && !late && coach.achievements.length > 0 && <div className="ach">{coach.achievements.map((a) => <span key={a.id} className={a.state}>{a.elite ? '★' : a.state === 'done' ? '✓' : a.state === 'late-done' ? '•' : a.state === 'live' ? '◔' : '×'} {a.label}</span>)}</div>}
    {f.personal && coach.personal && <small className="draft-note">Your avg on this hero: {coach.personal.gpm} GPM · {coach.personal.xpm} XPM ({coach.personal.n} games, patch-weighted)</small>}
    {!coach.benchmarkAvailable && <small className="draft-note">No benchmark data for this hero yet. Open Heroes → Update data now.</small>}
    {f.hints && <Foot>Score = percentile vs this hero's benchmarks · <kbd>{mod}F8</kbd> detail · <kbd>{mod}F10</kbd> hide</Foot>}
  </article>
}
