import { Eye } from 'lucide-react'
import type { Catalog, LiveState } from '../shared/model'
import { roleLabels } from '../shared/model'
import { Empty, Portrait, clock } from './ui'
import { Trophies } from './live'

/** Item/timing achievements, scored from each hero's own real OpenDota data (see shared/coach.ts) — never a fixed
 * hero or item list, so any hero you play, in any role, in ranked, normal or practice, builds its own record here. */
export function Achievements({ catalog, live }: { catalog: Catalog; live: LiveState }) {
  const rows = Object.entries(live.awards).map(([key, award]) => ({ key, ...award, hero: catalog.heroes.find((h) => h.id === award.heroId) }))
    .sort((a, b) => b.last! - a.last!)
  const trophyCount = Object.entries(live.career).filter(([id]) => !/^\d+:/.test(id)).reduce((sum, [, n]) => sum + n, 0)
  const busiestHero = rows.length ? [...new Map(rows.map((r) => [r.heroId, { hero: r.hero, heroId: r.heroId, n: 0 }]))
    .values()].map((entry) => ({ ...entry, n: rows.filter((r) => r.heroId === entry.heroId).reduce((sum, r) => sum + r.count, 0) }))
    .sort((a, b) => b.n - a.n)[0] : null
  return <>
    <div className="page-heading"><div><h1>Achievements</h1><p>Item timing goals, scored from each hero's own real data — any hero, any role, ranked, normal or practice.</p></div></div>
    {(trophyCount > 0 || live.vision.matches > 0) && <div className="metrics-grid">
      <article className="panel metric"><div className="metric-label">Trophies earned</div><div className="metric-number">{trophyCount}</div></article>
      <article className="panel metric"><div className="metric-label">Item timings awarded</div><div className="metric-number">{rows.reduce((sum, r) => sum + r.count, 0)}</div></article>
      <article className="panel metric"><div className="metric-label">Most decorated hero</div><div className="metric-number hero-name">{busiestHero?.hero?.name ?? '—'}</div></article>
      <article className="panel metric"><div className="metric-label">Wards placed (lifetime)</div><div className="metric-number">{live.vision.observer + live.vision.sentry}</div></article>
    </div>}
    <section className="panel form-panel reveal">
      <header className="panel-heading"><div><h2>Item timings</h2><p>Recorded the moment a core item lands on time, from your own practice or matchmaking games.</p></div></header>
      {rows.length ? <div className="milestone-grid">{rows.map((award) => <article key={award.key} className={'milestone' + (award.onTime > 0 ? ' earned' : '')}>
        <Portrait hero={award.hero} />
        <div className="milestone-info"><b>{award.label}</b><small>{award.hero?.name ?? 'Hero ' + award.heroId} · {roleLabels[award.role]}</small></div>
        <div className="milestone-count"><strong>{award.count}</strong><small>awarded</small></div>
        <div className="milestone-detail">
          <span>{award.onTime}/{award.count} elite timing</span>
          <span>Best {clock(award.best)}</span>
          <span>Last {clock(award.last)}</span>
        </div>
      </article>)}</div> : <Empty title="No item timings yet">Play a practice or matchmaking game with the listener on: landing a core item on pace records it here, for whichever hero and role you played.</Empty>}
    </section>
    <section className="panel form-panel reveal">
      <header className="panel-heading"><div><h2>Vision</h2><p>Observer/sentry wards placed, counted once per match the first time its parsed replay opens in Match Review — supports especially, but anyone's wards count.</p></div><Eye size={19} className="quiet-icon" /></header>
      {live.vision.matches > 0 ? <div className="metrics-grid">
        <article className="panel metric"><div className="metric-label">Observer wards</div><div className="metric-number">{live.vision.observer}</div></article>
        <article className="panel metric"><div className="metric-label">Sentry wards</div><div className="metric-number">{live.vision.sentry}</div></article>
        <article className="panel metric"><div className="metric-label">Parsed matches counted</div><div className="metric-number">{live.vision.matches}</div></article>
      </div> : <Empty title="No wards counted yet">Open a completed match in Match Review once OpenDota has parsed its replay — observer and sentry placements from that game count here.</Empty>}
    </section>
    <Trophies career={live.career} />
  </>
}
