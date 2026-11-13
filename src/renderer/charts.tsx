import { useId, useState } from 'react'
import { Empty, clock, fmt } from './ui'
import type { MatchPlayer, MatchSummary } from '../shared/model'

export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const points = values.map((value, i) => [2 + i * 85 / (values.length - 1), 27 - 21 * (value - min) / (max - min || 1)])
  const line = points.map((point) => point.join(',')).join(' ')
  return <svg className="sparkline" viewBox="0 0 89 34" aria-hidden="true">
    <polygon points={'2,33 ' + line + ' 87,33'} fill="currentColor" opacity=".09" />
    <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" />
  </svg>
}

export const rollingWins = (matches: MatchSummary[]) => {
  const decisions = matches.toReversed().flatMap((match) => match.won == null ? [] : [match.won])
  return decisions.map((_, i) => {
    const window = decisions.slice(Math.max(0, i - 4), i + 1)
    return window.filter(Boolean).length * 100 / window.length
  })
}

type Point = { y: number | null; label: string; comparison?: number | null }
export function LineChart({ points, title, percent = false, comparisonLabel, primaryLabel }: { points: Point[]; title: string; percent?: boolean; comparisonLabel?: string; primaryLabel?: string }) {
  const id = useId()
  const [hover, setHover] = useState<number | null>(null)
  const values = points.flatMap((point) => [point.y, point.comparison]).filter((value): value is number => value != null && Number.isFinite(value))
  if (!values.length) return <Empty title="Timeline unavailable">This series needs more match data.</Empty>
  const w = 708, h = 236, left = 50, top = 16, right = 13, bottom = 29
  const base = h - bottom
  const width = w - left - right
  const floor = Math.min(0, ...values)
  const ceiling = Math.max(1, ...values)
  const step = Math.max(0.25, 10 ** Math.floor(Math.log10((ceiling - floor) / 4)))
  const min = percent ? 0 : Math.floor(floor / step) * step
  const max = percent ? 100 : Math.ceil(ceiling / step) * step
  const scaleX = (index: number) => left + index * width / Math.max(1, points.length - 1)
  const scaleY = (value: number) => base - (value - min) * (base - top) / (max - min)
  const segments: string[][] = []
  let segment: string[] = []
  points.forEach((point, index) => {
    if (point.y == null) {
      if (segment.length) segments.push(segment)
      segment = []
    } else segment.push(scaleX(index) + ',' + scaleY(point.y))
  })
  if (segment.length) segments.push(segment)
  const marker = hover != null && points[hover]?.y != null ? hover : null
  const grid = Array.from({ length: 5 }, (_, i) => min + (max - min) * i / 4)
  const comparison = points.flatMap((point, index) => point.comparison == null ? [] : [scaleX(index) + ',' + scaleY(point.comparison)])
  const ticks = [...new Set(Array.from({ length: Math.min(5, points.length) }, (_, i) =>
    Math.round(i * (points.length - 1) / Math.min(4, Math.max(1, points.length - 1)))))]
  return <div className="chart" aria-label={title}>
    {comparisonLabel && <div className="chart-legend"><span>{primaryLabel}</span><span>{comparisonLabel}</span></div>}
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={title}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        const x = (event.clientX - rect.left) * w / rect.width
        setHover(Math.min(points.length - 1, Math.max(0, Math.round((x - left) * (points.length - 1) / width))))
      }} onPointerLeave={() => setHover(null)}>
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="var(--accent)" stopOpacity=".24" /><stop offset="100%" stopColor="var(--accent)" stopOpacity=".015" />
      </linearGradient></defs>
      {grid.map((value) => <g key={value}>
        <line x1={left} x2={w - right} y1={scaleY(value)} y2={scaleY(value)} className="chart-grid" />
        <text x={left - 10} y={scaleY(value) + 4} textAnchor="end">{value >= 1000 ? (value / 1000).toFixed(1).replace('.0', '') + 'k' : fmt(value)}{percent ? '%' : ''}</text>
      </g>)}
      {ticks.map((index) => <text key={index} x={scaleX(index)} y={h - 7} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}>{points[index].label}</text>)}
      {segments.map((line) => <g key={line[0]}>
        <polygon points={line[0].split(',')[0] + ',' + base + ' ' + line.join(' ') + ' ' + line.at(-1)?.split(',')[0] + ',' + base} fill={`url(#${id})`} />
        <polyline className="draw" pathLength={1} points={line.join(' ')} stroke="var(--accent)" strokeWidth="2.4" fill="none" strokeLinejoin="round" strokeLinecap="round" />
      </g>)}
      {comparison.length > 0 && <polyline points={comparison.join(' ')} stroke="var(--gold)" strokeWidth="2.4" fill="none" strokeDasharray="5 4" />}
      {points.map((point, i) => point.y == null || points.length > 35 ? null :
        <circle key={i} cx={scaleX(i)} cy={scaleY(point.y)} r={i === marker ? 4.7 : 2.7} fill="var(--accent)" />)}
      {marker != null && <line x1={scaleX(marker)} x2={scaleX(marker)} y1={top} y2={base} stroke="var(--accent)" strokeDasharray="4 4" opacity=".5" />}
    </svg>
    {marker != null && <output className="chart-tooltip">{points[marker].label} · {fmt(points[marker].y, percent ? 1 : 0)}{percent ? '%' : ''}{points[marker].comparison != null && ' / ' + fmt(points[marker].comparison, 1)}</output>}
  </div>
}

const metrics = ['Win rate', 'GPM', 'XPM', 'Last hits'] as const
export function HistoryChart({ matches }: { matches: MatchSummary[] }) {
  const [metric, setMetric] = useState<typeof metrics[number]>('Win rate')
  const rows = matches.slice(0, 20).toReversed()
  const wins = rollingWins(rows.toReversed())
  const decisive = rows.filter((match) => match.won != null)
  const points = metric === 'Win rate' ? decisive.map((match, index) => ({ y: wins[index], label: day(match.start) })) :
    rows.map((match) => ({ y: metric === 'GPM' ? match.gpm : metric === 'XPM' ? match.xpm : match.lastHits, label: day(match.start) }))
  return <section className="panel trend-panel">
    <header className="panel-heading">
      <div><h2>Performance trend</h2><p>{rows.length ? 'Last ' + rows.length + ' matches · ' + (metric === 'Win rate' ? 'Rolling 5-match win rate' : metric + ' per match') : 'Trends from your match history'}</p></div>
      <label className="sr-only" htmlFor="trend-metric">Trend metric</label>
      <select className="compact-select" id="trend-metric" value={metric} onChange={(event) => setMetric(event.target.value as typeof metric)}>{metrics.map((value) => <option key={value}>{value}</option>)}</select>
    </header>
    <LineChart points={points} title={metric + ' over recent matches'} percent={metric === 'Win rate'} />
  </section>
}

const reviewMetrics = { gold: 'Gold', xp: 'XP', lastHits: 'Last hits', deaths: 'Deaths' } as const
export function ReviewChart({ player }: { player: MatchPlayer }) {
  const [metric, setMetric] = useState<keyof typeof reviewMetrics>('gold')
  const points = player.minutes.map((minute) => ({ y: minute[metric], label: clock(minute.time) }))
  return <section className="panel trend-panel">
    <header className="panel-heading"><div><h2>Match timeline</h2><p>Recorded minute-by-minute stats</p></div></header>
    <div className="segment" aria-label="Timeline metric">
      {Object.entries(reviewMetrics).map(([key, label]) => <button key={key} type="button" aria-pressed={metric === key} onClick={() => setMetric(key as typeof metric)}>{label}</button>)}
    </div>
    <LineChart points={points} title={reviewMetrics[metric] + ' over game time'} />
  </section>
}

export function day(timestamp: number, year = false) {
  return timestamp > 0 ? new Date(timestamp * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) }) : '—'
}

/** One dot per recent match, oldest to newest. */
export function FormStrip({ matches }: { matches: MatchSummary[] }) {
  const rows = matches.slice(0, 20).toReversed()
  return <div className="form-strip" role="img" aria-label={'Results of your last ' + rows.length + ' matches'}>
    {rows.map((m, i) => <span key={m.id} className={'form-dot ' + (m.won == null ? '' : m.won ? 'w' : 'l')} style={{ ['--i' as string]: i }} title={(m.won ? 'Win' : 'Loss') + ' · ' + day(m.start)}>{m.won == null ? '·' : m.won ? 'W' : 'L'}</span>)}
  </div>
}

export function Donut({ slices, center, sub }: { slices: { label: string; value: number; color: string }[]; center: string; sub: string }) {
  const total = slices.reduce((a, b) => a + b.value, 0) || 1
  const R = 52, C = 2 * Math.PI * R
  let offset = 0
  return <div className="donut">
    <svg viewBox="0 0 140 140" role="img" aria-label="Hero pool">
      <circle cx="70" cy="70" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="16" />
      {slices.map((sl) => { const len = C * sl.value / total; const el = <circle key={sl.label} className="donut-arc" cx="70" cy="70" r={R} fill="none" stroke={sl.color} strokeWidth="16"
        strokeDasharray={len + ' ' + (C - len)} strokeDashoffset={-offset} transform="rotate(-90 70 70)" />; offset += len; return el })}
      <text x="70" y="68" textAnchor="middle" className="donut-n">{center}</text><text x="70" y="86" textAnchor="middle" className="donut-s">{sub}</text>
    </svg>
    <ul>{slices.map((sl) => <li key={sl.label}><i style={{ background: sl.color }} />{sl.label}<b>{sl.value}</b></li>)}</ul>
  </div>
}

export function Radar({ axes }: { axes: { label: string; value: number }[] }) {
  const n = axes.length, c = 110, R = 78
  const pt = (i: number, v: number) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [c + Math.cos(a) * R * v / 100, c + Math.sin(a) * R * v / 100] as const }
  const ring = (v: number) => axes.map((_, i) => pt(i, v).join(',')).join(' ')
  if (n < 3) return null
  return <svg className="radar" viewBox="-70 0 360 220" role="img" aria-label="Skill profile">
    {[25, 50, 75, 100].map((v) => <polygon key={v} points={ring(v)} fill="none" stroke="rgba(255,255,255,.1)" />)}
    {axes.map((_, i) => <line key={i} x1={c} y1={c} x2={pt(i, 100)[0]} y2={pt(i, 100)[1]} stroke="rgba(255,255,255,.08)" />)}
    <polygon className="radar-shape" points={axes.map((a, i) => pt(i, Math.max(4, Math.min(100, a.value))).join(',')).join(' ')} fill="rgba(210,60,48,.32)" stroke="var(--accent-hi)" strokeWidth="2" strokeLinejoin="round" />
    {axes.map((a, i) => { const [x, y] = pt(i, 122); return <text key={a.label} x={x} y={y + 3} textAnchor={x < c - 4 ? 'end' : x > c + 4 ? 'start' : 'middle'}>{a.label}</text> })}
  </svg>
}

export function Bars({ data, reference, unit = '' }: { data: { label: string; value: number | null; good?: boolean }[]; reference?: number | null; unit?: string }) {
  const values = data.flatMap((d) => d.value == null ? [] : [d.value])
  if (!values.length) return <Empty title="No data yet" />
  const max = Math.max(...values, reference ?? 0) * 1.1
  return <div className="bars" role="img" aria-label="Per-match values">
    {reference != null && <div className="bars-ref" style={{ bottom: (reference / max * 100) + '%' }}><span>median {fmt(reference)}{unit}</span></div>}
    {data.map((d, i) => <div key={i} className="bar-col" title={d.label + ': ' + fmt(d.value) + unit}>
      <i className={d.good == null ? '' : d.good ? 'good' : 'bad'} style={{ height: ((d.value ?? 0) / max * 100) + '%', ['--i' as string]: i }} /></div>)}
  </div>
}

/** Team gold lead per minute (Radiant minus Dire). Positive = Radiant ahead. */
export function DiffChart({ players }: { players: MatchPlayer[] }) {
  const rad = players.filter((p) => p.side === 'Radiant' && p.minutes.length), dire = players.filter((p) => p.side === 'Dire' && p.minutes.length)
  if (rad.length < 2 || dire.length < 2) return <Empty title="Team graph unavailable">Needs parsed data for both teams.</Empty>
  const len = Math.min(...[...rad, ...dire].map((p) => p.minutes.length))
  const diff = Array.from({ length: len }, (_, i) => rad.reduce((s, p) => s + (p.minutes[i].gold ?? 0), 0) - dire.reduce((s, p) => s + (p.minutes[i].gold ?? 0), 0))
  const max = Math.max(1000, ...diff.map(Math.abs)), w = 708, h = 200, mid = h / 2
  const x = (i: number) => 8 + i * (w - 16) / Math.max(1, len - 1), y = (v: number) => mid - v / max * (mid - 14)
  const line = diff.map((v, i) => x(i) + ',' + y(v)).join(' ')
  const id = useId()
  return <div className="chart"><svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Team gold lead over time">
    <defs><clipPath id={id + 'a'}><rect x="0" y="0" width={w} height={mid} /></clipPath><clipPath id={id + 'b'}><rect x="0" y={mid} width={w} height={mid} /></clipPath></defs>
    <line x1="0" x2={w} y1={mid} y2={mid} className="chart-grid" />
    <polygon clipPath={`url(#${id}a)`} points={`${x(0)},${mid} ${line} ${x(len - 1)},${mid}`} fill="rgba(107,191,89,.35)" />
    <polygon clipPath={`url(#${id}b)`} points={`${x(0)},${mid} ${line} ${x(len - 1)},${mid}`} fill="rgba(224,87,75,.35)" />
    <polyline className="draw" pathLength={1} points={line} fill="none" stroke="var(--text)" strokeWidth="1.6" strokeLinejoin="round" />
    <text x="8" y="12">Radiant ahead +{fmt(max / 1000, 1)}k</text><text x="8" y={h - 4}>Dire ahead</text>
  </svg></div>
}

/** Jagged torn-paper edge between the dark stage and the light guide sections. */
export function TornEdge() {
  const pts = (() => {
    let seed = 7
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const out = ['0,80']
    for (let x = 0; x <= 1000; x += 16) out.push(x + ',' + (rnd() < .12 ? 8 + rnd() * 14 : 26 + rnd() * 26))
    out.push('1000,80')
    return out.join(' ')
  })()
  return <svg className="torn" viewBox="0 0 1000 80" preserveAspectRatio="none" aria-hidden="true"><polygon points={pts} /></svg>
}

/** Dota's own advantage arrays (Radiant minus Dire per minute), as the in-game graph shows them. */
export function AdvChart({ gold, xp }: { gold: number[]; xp: number[] }) {
  const len = Math.max(gold.length, xp.length)
  if (len < 3) return null
  const max = Math.max(1000, ...gold.map(Math.abs), ...xp.map(Math.abs)), w = 708, h = 190, mid = h / 2
  const x = (i: number) => 8 + i * (w - 16) / (len - 1), y = (v: number) => mid - v / max * (mid - 14)
  const pts = (a: number[]) => a.map((v, i) => x(i) + ',' + y(v)).join(' ')
  return <div className="chart"><svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Gold and experience advantage">
    <line x1="0" x2={w} y1={mid} y2={mid} className="chart-grid" />
    {gold.length > 2 && <polyline className="draw" pathLength={1} points={pts(gold)} fill="none" stroke="var(--gold)" strokeWidth="2.2" strokeLinejoin="round" />}
    {xp.length > 2 && <polyline className="draw" pathLength={1} points={pts(xp)} fill="none" stroke="var(--info)" strokeWidth="2" strokeLinejoin="round" />}
    <text x="8" y="12">Radiant ahead</text><text x="8" y={h - 4}>Dire ahead</text><text x={w - 8} y="12" textAnchor="end" fill="var(--gold)">● Gold</text><text x={w - 60} y="12" textAnchor="end" fill="var(--info)">● XP</text>
  </svg></div>
}
