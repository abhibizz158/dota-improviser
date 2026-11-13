import type { Catalog, LiveState } from '../shared/model'
import { roleLabels } from '../shared/model'
import { Empty, Portrait, clock } from './ui'
import { Trophies } from './live'

/** Item/timing achievements, scored from each hero's own real OpenDota data (see shared/coach.ts) — never a fixed
 * hero or item list, so any hero you play, in any role, in ranked, normal or practice, builds its own record here. */
export function Achievements({ catalog, live }: { catalog: Catalog; live: LiveState }) {
  const rows = Object.entries(live.awards).map(([key, award]) => ({ key, ...award, hero: catalog.heroes.find((h) => h.id === award.heroId) }))
    .sort((a, b) => b.last! - a.last!)
  return <>
    <div className="page-heading"><div><h1>Achievements</h1><p>Item timing goals, scored from each hero's own real data — any hero, any role, ranked, normal or practice.</p></div></div>
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
    <Trophies career={live.career} />
  </>
}
