import type { Catalog, LiveState } from '../shared/model'
import { roleLabels } from '../shared/model'
import { itemMilestones } from '../shared/live-coach'
import { Portrait, clock } from './ui'
import { Trophies } from './live'

/** Hero- and role-specific item timing goals (e.g. Battle Fury on a carry Anti-Mage), tracked from your own practice games. */
export function Achievements({ catalog, live }: { catalog: Catalog; live: LiveState }) {
  const awards = live.awards
  return <>
    <div className="page-heading"><div><h1>Achievements</h1><p>Item timing goals that only count on their intended hero and role, tracked from your own practice games.</p></div></div>
    <section className="panel form-panel reveal">
      <header className="panel-heading"><div><h2>Item milestones</h2><p>Awarded once per practice game when the item lands on the matching hero and role.</p></div></header>
      <div className="milestone-grid">
        {itemMilestones.map((goal) => {
          const hero = catalog.heroes.find((h) => h.slug === goal.hero)
          const award = awards[goal.id]
          return <article key={goal.id} className={'milestone' + (award ? ' earned' : '')}>
            <Portrait hero={hero} />
            <div className="milestone-info"><b>{goal.name}</b><small>{hero?.name ?? goal.hero} · {roleLabels[goal.role]} · by {clock(goal.target)}</small></div>
            <div className="milestone-count"><strong>{award?.count ?? 0}</strong><small>awarded</small></div>
            {award && <div className="milestone-detail">
              <span>{award.onTime}/{award.count} on time</span>
              <span>Best {clock(award.best)}</span>
              <span>Last {clock(award.last)}</span>
            </div>}
          </article>
        })}
      </div>
    </section>
    <Trophies career={live.career} />
  </>
}
