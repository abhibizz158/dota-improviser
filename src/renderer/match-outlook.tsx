import { memo, useState } from 'react'
import type { MatchOutlook, OutlookPoint } from '../shared/match-outlook.js'

const matchTime = (value: number) => Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0')

export const OutlookGraph = memo(function OutlookGraph({ points, detailed = false }: { points: OutlookPoint[]; detailed?: boolean }) {
  const [selected, setSelected] = useState<number | null>(null)
  if (points.length < 2) return null
  const first = points[0].at
  const last = points[points.length - 1].at
  const width = 420, height = detailed ? 128 : 46
  const x = (point: OutlookPoint) => 4 + (point.at - first) * (width - 8) / Math.max(1, last - first)
  const y = (value: number) => 4 + (100 - value) * (height - 8) / 100
  const line = points.map((point) => x(point) + ',' + y(point.win)).join(' ')
  const current = points[Math.min(selected ?? points.length - 1, points.length - 1)]
  return <div className={'outlook-graph' + (detailed ? ' detailed' : '')}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Team win estimate over time, from ${points[0].win}% to ${points[points.length - 1].win}%`}>
      {detailed && [25, 75].map((level) => <line key={level} className="outlook-gridline" x1="4" x2={width - 4} y1={y(level)} y2={y(level)} />)}
      <line className="outlook-gridline baseline" x1="4" x2={width - 4} y1={y(50)} y2={y(50)} />
      <polygon className="outlook-area" points={`4,${y(50)} ${line} ${width - 4},${y(50)}`} />
      <polyline className="outlook-line" points={line} />
      <circle className="outlook-marker" cx={x(current)} cy={y(current.win)} r={detailed ? 3.5 : 3} />
    </svg>
    {detailed && <>
      <div className="outlook-axis"><span>{matchTime(first)}</span><span>50% baseline</span><span>{matchTime(last)}</span></div>
      <label className="outlook-scrub"><span>{matchTime(current.at)} · {current.win}%{current.win === 0 || current.win === 100 ? ' · Final result' : ''}</span>
        <input type="range" min={0} max={points.length - 1} value={selected == null ? points.length - 1 : Math.min(selected, points.length - 1)}
          aria-label="Explore match estimate by time" onChange={(event) => setSelected(Number(event.target.value))} />
      </label>
    </>}
  </div>
})

export function OutlookCard({ outlook, compact = false }: { outlook: MatchOutlook; compact?: boolean }) {
  return <section className={'match-outlook ' + (outlook.win < 50 ? 'trailing' : 'leading') + (compact ? ' compact' : '')} aria-label="Estimated team win chance">
    <header><span>Win estimate</span><strong>{outlook.win}%</strong></header>
    <OutlookGraph points={outlook.points} />
    {outlook.scope === 'Lineup only' && <small>Lineup only</small>}
    {!compact && outlook.scope !== 'Lineup only' && <small>{outlook.factors.join(' · ')}</small>}
  </section>
}
