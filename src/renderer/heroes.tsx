import { useEffect, useMemo, useState } from 'react'
import { Database, Search } from 'lucide-react'
import type { AppApi, Catalog, HeroDetail, LiveState } from '../shared/model'
import { brackets } from '../shared/contextual-coach'
import { FEATURE_LABELS, GLOSSARY, atLevel } from '../shared/mechanics'
import { Dialog, Empty, Feedback, fmt, Portrait } from './ui'


const metrics = [['gpm', 'GPM'], ['xpm', 'XPM'], ['lhpm', 'Last hits/min'], ['kpm', 'Kills/min'], ['dpm', 'Hero dmg/min']] as const
const attrName = ['Strength', 'Agility', 'Intelligence', 'Universal']
const dmgName: Record<number, string> = { 1: 'physical', 2: 'magical', 4: 'pure' }
const chipTone = (s: string) => ['stun', 'hex', 'sleep', 'fear', 'taunt', 'root'].includes(s) ? 'hard' : ['silence', 'disarm', 'mute', 'break', 'slow', 'knockback', 'blind'].includes(s) ? 'soft' : 'util'

/** Everything the model knows about a hero: attributes, computed stats at three levels, each ability's effects. */
function KitPanel({ detail, catalog, updating }: { detail: HeroDetail; catalog: Catalog; updating: boolean }) {
  const kit = detail.kit
  const name = (id: number) => catalog.heroes.find((h) => h.id === id)?.name ?? 'Hero ' + id
  if (!kit) return <Empty title={updating ? 'Downloading hero data…' : 'Mechanics data not available yet'}>{updating ? 'This hero’s ability data is on its way.' : 'Press Update data now above to fetch it.'}</Empty>
  const s = kit.s
  const levels = [1, 11, 25].map((l) => ({ l, v: atLevel(kit, l) }))
  const row = (label: string, f: (v: ReturnType<typeof atLevel>) => string) => <tr key={label}><td>{label}</td>{levels.map(({ l, v }) => <td key={l}>{f(v)}</td>)}</tr>
  return <>
    <div><h3>Attributes · {attrName[s.attr] ?? '—'} primary</h3><div className="attr-grid">
      {([['STR', s.str, s.strg], ['AGI', s.agi, s.agig], ['INT', s.int, s.intg]] as const).map(([k, base, gain]) => <div key={k}><b>{k}</b><span>{fmt(base, 0)} <em>+{fmt(gain, 1)}/lvl</em></span></div>)}</div></div>
    <div><h3>Computed stats (no items)</h3><table className="bench-table"><thead><tr><th>Stat</th>{levels.map(({ l }) => <th key={l}>Lv {l}</th>)}</tr></thead><tbody>
      {row('Health', (v) => fmt(v.hp, 0))}{row('Mana', (v) => fmt(v.mana, 0))}{row('Armor', (v) => fmt(v.armor, 1))}{row('Magic resist', (v) => fmt(v.mr * 100, 0) + '%')}
      {row('Attacks / sec', (v) => fmt(v.aps, 2))}{row('Damage', (v) => fmt(v.dmg, 0))}{row('Move speed', (v) => fmt(v.ms, 0))}{row('Attack range', (v) => fmt(v.range, 0))}</tbody></table></div>
    <div><h3>Abilities and what they do</h3><div className="kit-list">{kit.a.map((a) => <div key={a.n} className="kit-ability"><b>{a.n}{a.u && <em>ULT</em>}{a.p && <em>PASSIVE</em>}</b>
      <div className="status-row">{a.c.map((c) => <span key={c} className={'status-chip ' + chipTone(c)}>{c}</span>)}{a.d > 0 && <span className="status-chip dmg">{dmgName[a.d]} damage</span>}{a.x && <span className="status-chip pierce">pierces BKB</span>}{a.c.length === 0 && a.d === 0 && <small className="muted">utility</small>}</div></div>)}</div>
      <p className="fine-print">Effects are read from Valve's ability text; damage type and BKB-piercing come from Valve's data fields.</p></div>
    {detail.mechStrong && detail.mechStrong.length > 0 && <div className="counter-cols">
      <div><h3>Mechanically strong against</h3><div className="counter-list">{detail.mechStrong.map((r) => <div key={r.heroId}><Portrait hero={catalog.heroes.find((h) => h.id === r.heroId)} />{name(r.heroId)}<b className="positive">+{fmt(r.edge, 1)}</b><small>{r.parts[0] ? FEATURE_LABELS[r.parts[0].label].split(' (')[0] : ''}</small></div>)}</div></div>
      <div><h3>Mechanically weak against</h3><div className="counter-list">{detail.mechWeak?.map((r) => <div key={r.heroId}><Portrait hero={catalog.heroes.find((h) => h.id === r.heroId)} />{name(r.heroId)}<b className="negative">{fmt(r.edge, 1)}</b><small>{r.parts[0] ? FEATURE_LABELS[r.parts[0].label].split(' (')[0] : ''}</small></div>)}</div></div></div>}
    {detail.model && <p className="fine-print">These edges come from a model calibrated on {detail.model.samples.toLocaleString()} real matchups: it explains {Math.round(detail.model.r2 * 100)}% of the variation beyond raw hero strength. Biggest factors: {detail.model.importance.slice(0, 4).map((m) => FEATURE_LABELS[m.name].split(' (')[0].toLowerCase() + ' ' + Math.round(m.share * 100) + '%').join(', ')}.</p>}
  </>
}

const pcts = ['10th', '30th', '50th', '70th', '90th', '99th']

export function Heroes({ api, catalog, live, onDraft }: { api: AppApi; catalog: Catalog; live: LiveState; onDraft: (id: number) => void }) {
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('')
  const [id, setId] = useState(catalog.heroes.find((h) => h.slug === 'phantom_assassin')?.id ?? catalog.heroes[0].id)
  const [detail, setDetail] = useState<HeroDetail | null>(null)
  const [guide, setGuide] = useState(false)
  useEffect(() => { let on = true; void api.heroDetail(id).then((d) => { if (on) setDetail(d) }).catch(() => {}); return () => { on = false } }, [api, id, live.data.updatedAt, live.data.state])
  const roles = useMemo(() => [...new Set(catalog.heroes.flatMap((h) => h.roles))].sort(), [catalog])
  const list = catalog.heroes.filter((h) => (!query || h.name.toLowerCase().includes(query.toLowerCase())) && (!role || h.roles.includes(role)))
  const hero = catalog.heroes.find((h) => h.id === id)!
  const name = (hid: number) => catalog.heroes.find((h) => h.id === hid)?.name ?? 'Hero ' + hid
  const d = detail?.data
  const totalPick = d ? d.pick.reduce((a, b) => a + b, 0) : 0
  return <>
    {live.data.state === 'error' && <Feedback error message={live.data.message} />}
    <div className="page-heading"><div><h1>Hero database</h1><p>Win rates, benchmarks and counters for every hero, from public OpenDota data.</p></div>
      <div className="actions">
        {live.data.state === 'updating' && <span className="status-pill"><i /> Updating {live.data.done}/{live.data.total}</span>}
        {live.data.state === 'error' && <span className="status-pill" title={live.data.message}><i /> Update failed</span>}
        {live.data.state !== 'updating' && live.data.updatedAt > 0 && <span className="status-pill connected"><i /> Data {new Date(live.data.updatedAt).toLocaleDateString()}{detail?.patch ? ' · patch ' + detail.patch : ''}</span>}
        <button className="button" onClick={() => setGuide(true)}>Mechanics guide</button>
        <button className="button" disabled={live.data.state === 'updating' || live.status === 'Pick phase' || Boolean(live.coach)} onClick={() => void api.updateData()}>Update data now</button>
      </div></div>
    <div className="hero-browser">
      <section className="panel form-panel">
        <div className="actions"><label className="field" style={{ flex: 1 }}><span className="sr-only">Search</span><input placeholder="Search heroes" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}><option value="">All roles</option>{roles.map((r) => <option key={r}>{r}</option>)}</select></div>
        <div className="hero-grid">{list.map((h) => <button key={h.id} className="hero-tile" aria-pressed={h.id === id} onClick={() => setId(h.id)}><Portrait hero={h} /><small>{h.name}</small></button>)}</div>
      </section>
      <section className="panel hero-detail">
        <div className="review-hero"><Portrait hero={hero} /><div><h2>{hero.name}</h2><p>{hero.roles.join(' · ')}{live.draft.patched.includes(id) ? ' · changed in a recent patch (older matchup data down-weighted)' : ''}</p></div>
          <button className="button primary" onClick={() => onDraft(id)}><Search size={15} /> Use in draft</button></div>
        {!d ? <Empty title={live.data.state === 'updating' ? 'Downloading hero data…' : 'No data for this hero yet'}>{live.data.state === 'updating' ? 'Stats for this hero are on their way (' + live.data.done + '/' + live.data.total + ').' : 'Press Update data now above to fetch it.'}</Empty> : <>
          <div><h3>Win rate by rank</h3><div className="stat-bars">{brackets.map((b, i) => {
            const wr = d.pick[i] ? 100 * d.win[i] / d.pick[i] : null
            return <div className="stat-bar" key={b}><span>{b}</span><div className="meter single"><i style={{ width: Math.min(100, Math.max(0, ((wr ?? 50) - 40) * 5)) + '%' }} /></div><b>{wr == null ? '—' : fmt(wr, 1) + '%'}</b></div>
          })}</div><p className="fine-print">{fmt(totalPick)} picks in window · pro: {fmt(d.pro[0])} picks, {d.pro[0] ? fmt(100 * d.pro[1] / d.pro[0], 1) : '—'}% wins, {fmt(d.pro[2])} bans · turbo: {d.turbo[0] ? fmt(100 * d.turbo[1] / d.turbo[0], 1) + '%' : '—'} over {fmt(d.turbo[0])}</p></div>
          <div><h3>Benchmarks (percentile of all players on this hero)</h3><table className="bench-table"><thead><tr><th>Metric</th>{pcts.map((p) => <th key={p}>{p}</th>)}</tr></thead>
            <tbody>{metrics.map(([k, label]) => <tr key={k}><td>{label}</td>{d.bench[k].map((v, i) => <td key={i}>{v == null ? '—' : fmt(v, k === 'gpm' || k === 'xpm' || k === 'dpm' ? 0 : 2)}</td>)}</tr>)}</tbody></table></div>
          <div><h3>Items by phase (purchase counts)</h3>{(['starting', 'early', 'mid', 'late'] as const).map((s) => <p key={s} className="item-chips"><b style={{ color: 'var(--muted)' }}>{s}</b>{d.items[s].map(([k]) => <span key={k}>{catalog.items[k] ?? k}</span>)}</p>)}</div>
        </>}
        <div className="counter-cols">
          <div><h3>Strong against</h3><div className="counter-list">{detail?.strongAgainst.map((r) => <div key={r.heroId}><Portrait hero={catalog.heroes.find((h) => h.id === r.heroId)} />{name(r.heroId)}<b className="positive">{fmt(r.rate, 1)}%</b></div>)}</div></div>
          <div><h3>Weak against</h3><div className="counter-list">{detail?.weakAgainst.map((r) => <div key={r.heroId}><Portrait hero={catalog.heroes.find((h) => h.id === r.heroId)} />{name(r.heroId)}<b className="negative">{fmt(r.rate, 1)}%</b></div>)}</div></div>
        </div>
        <KitPanel detail={detail ?? ({ id, data: null, patch: '', percentiles: [], strongAgainst: [], weakAgainst: [] } as HeroDetail)} catalog={catalog} updating={live.data.state === 'updating'} />
        <p className="fine-print"><Database size={12} /> Matchup rates come from the bundled seed ({fmt(detail?.strongAgainst.length ?? 0)}+ pairs with 60+ games), shrunk toward what overall strength and mechanics predict on small samples.</p>
      </section>
    </div>
    {guide && <Dialog title="Mechanics guide" onClose={() => setGuide(false)}><div className="glossary">{[...new Set(GLOSSARY.map((g) => g.group))].map((group) => <section key={group}><h3>{group}</h3>
      {GLOSSARY.filter((g) => g.group === group).map((g) => <p key={g.term}><b>{g.term}</b> <em>{g.short}</em><br />{g.detail}</p>)}</section>)}
      <p className="fine-print">Stats, armor, damage and durability are computed from these rules. Effects are read from Valve's ability text. How much each mechanic matters is learned from public matches.</p></div></Dialog>}
  </>
}
