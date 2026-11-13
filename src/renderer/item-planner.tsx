import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Plus, X } from 'lucide-react'
import type { AppApi, Build, Catalog, Hero, HeroDetail, ItemUpgrade, LiveState } from '../shared/model'
import { buildCurve, canPlan, emptyItemLearning, gearAt, maxPlanItems, REF_ARMOR } from '../shared/items'
import type { Gear, ItemInfo, TreadsAttribute } from '../shared/items'
import { LineChart } from './charts'
import { estimatePurchase } from '../shared/timing'
import { clock, Empty, Feedback, fmt } from './ui'
import items from 'virtual:dota-items'

const metrics = {
  hp: ['Health', 0, ''], mana: ['Mana', 0, ''], str: ['Strength', 1, ''], agi: ['Agility', 1, ''], int: ['Intelligence', 1, ''],
  armor: ['Armor', 1, ''], mr: ['Magic resistance', 1, '%'], evasion: ['Evasion', 1, '%'], regen: ['Health regen', 1, '/s'],
  manaRegen: ['Mana regen', 1, '/s'], ms: ['Move speed', 0, ''], dmg: ['Attack damage', 1, ''], aps: ['Attacks per second', 2, ''],
  dps: ['Attack DPS', 1, ''], physicalHp: ['Effective HP vs attacks', 0, ''], magicalHp: ['Effective HP vs magic', 0, ''],
} satisfies Partial<Record<keyof Gear, [string, number, string]>>
type Metric = keyof typeof metrics
const score = (stats: Gear, metric: Metric) => stats[metric] * (metrics[metric][2] === '%' ? 100 : 1)
const signed = (value: number, digits: number) => (value > 0 ? '+' : '') + fmt(value, digits)
const itemsByName = Object.keys(items).sort((a, b) => items[a].n.localeCompare(items[b].n))
const selectableItems = itemsByName.filter((key) => canPlan(items[key]))
const pct = (value: number | null) => value == null ? '—' : fmt(value * 100, 0) + '%'

function ItemDetails({ item, upgrade }: { item: ItemInfo; upgrade?: ItemUpgrade }) {
  return <div className="item-details">
    <div className="item-cost"><strong>{item.n}</strong><span>{item.c > 0 ? fmt(item.c) + ' gold' : 'No shop price'}</span></div>
    {(item.cooldown || item.manaCost) && <p className="fine-print">{[item.cooldown && 'Cooldown ' + item.cooldown + 's', item.manaCost && 'Mana ' + item.manaCost].filter(Boolean).join(' · ')}</p>}
    {item.p.length > 0 && <p className="fine-print">Components: {item.p.map((key) => items[key]?.n ?? key.replaceAll('_', ' ')).join(', ')}</p>}
    {item.fx.map((effect, index) => <div className="item-effect" key={index}><strong>{effect.title}</strong><small>{effect.t}</small><p>{effect.text}</p></div>)}
    {upgrade && <div className="item-effect"><strong>{upgrade.name}</strong><small>Hero upgrade</small><p>{upgrade.text}</p></div>}
    {!!item.attributes?.length && <details className="item-attributes"><summary>All recorded item values</summary>
      <dl>{item.attributes.map(({ label, key, value }, index) => <div key={key + index}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </details>}
  </div>
}

type Props = {
  api: AppApi; hero: Hero; account: string; enabled: boolean; live: LiveState; item: string; onItem: (key: string) => void
  build?: Build; upgrades?: NonNullable<Catalog['upgrades']>[number]; situational: { key: string; reason: string }[]; onMatch: (id: string) => void
}

export function ItemPlanner({ api, hero, account, enabled, live, item, onItem, build, upgrades, situational, onMatch }: Props) {
  const inspector = useRef<HTMLElement>(null)
  const [detail, setDetail] = useState<HeroDetail | null>(null)
  const [learning, setLearning] = useState(emptyItemLearning)
  const [order, setOrder] = useState<string[]>([])
  const [approved, setApproved] = useState<string[]>([])
  const [planReady, setPlanReady] = useState(false)
  const [level, setLevel] = useState(15)
  const [metric, setMetric] = useState<Metric>('hp')
  const [treads, setTreads] = useState<TreadsAttribute>('Strength')
  const [syncing, setSyncing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [learnError, setLearnError] = useState('')
  const [planError, setPlanError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [gpm, setGpm] = useState('')
  const [xpm, setXpm] = useState('')
  const [compareUsual, setCompareUsual] = useState(true)
  const [message, setMessage] = useState('')
  const buildRefreshed = Boolean(build)

  useEffect(() => {
    let current = true
    void api.heroDetail(hero.id, false).then((value) => { if (current) setDetail(value) })
      .catch(() => { if (current) setDetailError('Hero stats are unavailable. Item descriptions and saved plans are still available.') })
    void api.buildPlan(hero.id).then((value) => {
      if (current) { setOrder(value); setApproved(value); setPlanReady(true) }
    }).catch((reason: Error) => { if (current) { setPlanError(reason.message); setPlanReady(true) } })
    return () => { current = false }
  }, [api, hero.id])

  useEffect(() => {
    let current = true
    if (account && enabled && !syncing) {
      setLearnError('')
      void api.itemLearn(hero.id).then((value) => {
        if (current) setLearning((previous) => ({ ...value, sync: previous.sync }))
      }).catch((reason: Error) => { if (current) setLearnError(reason.message) })
    }
    return () => { current = false }
  }, [api, hero.id, account, enabled, syncing, buildRefreshed])

  useEffect(() => { if (item) inspector.current?.scrollIntoView({ block: 'nearest' }) }, [item])

  const learned = enabled && account ? learning : emptyItemLearning
  const defaultItem = learned.usual[0] ?? build?.mid.find(({ item }) => items[item])?.item ?? 'power_treads'
  const key = item || defaultItem
  const inspected = items[key]
  const upgrade = key === 'aghanims_shard' ? upgrades?.shard : ['ultimate_scepter', 'ultimate_scepter_2'].includes(key) ? upgrades?.scepter : undefined
  const habit = learned.habits.find((entry) => entry.key === key)
  const kit = detail?.kit
  const baseline = order.filter((entry) => entry !== key).map((entry) => items[entry])
  const base = kit && gearAt(kit, level, baseline, treads, hero.ranged)
  const equipped = kit && gearAt(kit, level, inspected && canPlan(inspected) ? [...baseline, inspected] : baseline, treads, hero.ranged)
  const chartLevels = kit && inspected && canPlan(inspected) ? Array.from({ length: 30 }, (_, index) => {
    const at = index + 1
    return {
      label: 'Lv ' + at,
      y: score(gearAt(kit, at, [...baseline, inspected], treads, hero.ranged), metric),
      comparison: score(gearAt(kit, at, baseline, treads, hero.ranged), metric),
    }
  }) : []
  const median = (kind: 'gpm' | 'xpm') => detail?.data?.bench[kind]?.[detail.percentiles.indexOf(0.5)] ??
    detail?.data?.bench[kind]?.[detail.percentiles.indexOf(50)] ?? null
  const defaultGpm = Math.round(learned.gpm ?? median('gpm') ?? 450)
  const defaultXpm = Math.round(learned.xpm ?? median('xpm') ?? 550)
  const income = Number(gpm || defaultGpm)
  const experience = Number(xpm || defaultXpm)
  const paceValid = income >= 50 && income <= 2500 && experience >= 50 && experience <= 2500
  const livePractice = live.status === 'Live' || live.status === 'Paused'
  const estimate = inspected ? estimatePurchase({
    nowSeconds: livePractice ? live.lane?.clock ?? 0 : 0,
    gold: livePractice ? live.coach?.stats.gold ?? 0 : 600,
    gpm: livePractice ? live.coach?.gpm ?? income : income,
    cost: inspected.c,
    usualSeconds: habit?.avgTime,
    sampleGames: habit?.games,
  }) : null
  const curve = kit && order.length && paceValid
    ? buildCurve(kit, order, items, income, experience, 45, treads, hero.ranged) : null
  const usualCurve = kit && curve && compareUsual && learned.usual.length > 0
    ? buildCurve(kit, learned.usual, items, income, experience, 45, treads, hero.ranged) : null
  const publicCore = build ? [...build.early, ...build.mid, ...build.late].map((entry) => entry.item) : []
  const options = useMemo(() => [...new Map(situational.filter(({ key }) => items[key]).map((entry) => [entry.key, entry])).values()].slice(0, 5), [situational])
  const dirty = order.join() !== approved.join()

  async function sync() {
    setSyncing(true)
    setLearnError('')
    try { setLearning(await api.itemLearn(hero.id, true)) }
    catch (reason) { setLearnError(reason instanceof Error ? reason.message : 'Could not load recent purchases.') }
    finally { setSyncing(false) }
  }

  function replace(next: string[]) {
    setOrder(next)
    setMessage('')
  }

  function move(index: number, delta: number) {
    const next = [...order]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    replace(next)
  }

  async function save() {
    setSaving(true)
    setPlanError('')
    setMessage('')
    try {
      setApproved(await api.buildPlan(hero.id, order))
      setMessage(order.length ? 'Build approved and saved.' : 'Approved build cleared.')
    } catch (reason) { setPlanError(reason instanceof Error ? reason.message : 'Could not save this build.') }
    finally { setSaving(false) }
  }

  return <>
    <section className="panel item-panel">
      <header className="panel-heading"><div><h2>Your purchase habits</h2><p>{learned.games
        ? learned.games + ' parsed All Pick matches on ' + hero.name + ' · Up to 20 most recent saved matches'
        : 'Compare repeat purchases and timings in your All Pick matches.'}</p></div>
        {account && enabled && <button type="button" className="button slim" disabled={syncing} onClick={() => void sync()}>{syncing ? 'Loading matches…' : 'Load recent purchases'}</button>}</header>
      <Feedback error message={learnError} />
      {learned.sync && <p className="fine-print" role="status">{learned.sync.checked} recent matches checked{learned.sync.failed ? ' · ' + learned.sync.failed + ' unavailable' : ''}. Parsed matches with purchase logs contribute to this view.</p>}
      {learned.habits.length ? <>
        <div className="item-table-scroll"><table className="item-table">
          <thead><tr><th>Item</th><th>Purchased</th><th>Avg. first buy</th><th>Win rate with</th><th>Win rate without</th></tr></thead>
          <tbody>{learned.habits.slice(0, 12).map((entry) => <tr key={entry.key}>
            <td><button type="button" className="text-button" onClick={() => onItem(entry.key)}>{items[entry.key]?.n ?? entry.key}</button></td>
            <td>{entry.games}/{learned.games}</td><td>{clock(entry.avgTime)}</td>
            <td>{pct(entry.winWith)} <small>({entry.nWith})</small></td><td>{pct(entry.winWithout)} <small>({entry.nWithout})</small></td>
          </tr>)}</tbody>
        </table></div>
        <p className="fine-print">The without-item group includes games that reached the average purchase time. Win rates describe these matches and can reflect lineup, role, and game state.</p>
      </> : <Empty title="No purchase history for this hero">{!account ? 'Add a Dota account to learn from your purchases.' : !enabled ? 'Turn on Learn from my matches in Live & Coach.' : 'Load recent purchases or open a parsed match on this hero.'}</Empty>}
      {(learned.advice.length > 0 || options.length > 0) && <div className="item-advice">
        {[...learned.advice.flatMap((entry) => entry.key ? [{ key: entry.key, reason: entry.text }] : []), ...options].map(({ key, reason }, index) =>
          <div key={key + index}><p>{reason}</p><button type="button" className="text-button" onClick={() => onItem(key)}>Inspect {items[key]?.n ?? key}</button></div>)}
      </div>}
    </section>

    <div className="item-workspace">
      <section className="panel item-panel" ref={inspector}>
        <header className="panel-heading"><div><h2>Item on {hero.name}</h2><p>Compare stats at the same level, with and without the item.</p></div></header>
        <div className="item-controls">
          <label className="field">Inspect item<select value={key} onChange={(event) => onItem(event.target.value)}>
            {!items[key] && <option value={key}>{key}</option>}
            {itemsByName.map((entry) => <option key={entry} value={entry}>{items[entry].n}</option>)}
          </select></label>
          <label className="field">Hero level<select value={level} onChange={(event) => setLevel(Number(event.target.value))}>
            {Array.from({ length: 30 }, (_, index) => <option key={index + 1}>{index + 1}</option>)}
          </select></label>
          {(key === 'power_treads' || order.includes('power_treads')) && <label className="field">Treads attribute<select value={treads} onChange={(event) => setTreads(event.target.value as TreadsAttribute)}>
            <option>Strength</option><option>Agility</option><option>Intelligence</option>
          </select></label>}
        </div>
        <Feedback message={detailError} error />
        {inspected ? <ItemDetails item={inspected} upgrade={upgrade} /> : <p className="fine-print">Item details are unavailable in the current catalog.</p>}
        {inspected && estimate && <div className="item-timing-note"><div><strong>Timing check</strong><span>{estimate.stage} item · {livePractice ? 'own practice feed' : 'planning projection'}</span></div>
          <p>{estimate.note}</p><small>{estimate.downside}</small>
          {habit && <small>Your average first purchase is {clock(habit.avgTime)} across {habit.games} matches.</small>}
        </div>}
        {base && equipped && inspected && canPlan(inspected) && <>
          <p className="fine-print">{baseline.length ? 'Baseline includes the other items in your draft plan.' : 'Baseline is the hero with no items.'} Attack DPS assumes {REF_ARMOR} enemy armor. The model uses the listed passive stats and omits talents, buffs and triggered effects. Tranquil Boots use their unbroken values.</p>
          <dl className="item-stat-grid">{(Object.keys(metrics) as Metric[]).filter((stat) => Math.abs(score(equipped, stat) - score(base, stat)) >= 0.005 || stat === 'hp' || stat === 'dps').map((stat) => {
            const [label, digits, unit] = metrics[stat]
            const before = score(base, stat), after = score(equipped, stat)
            return <div key={stat}><dt>{label}</dt><dd>{fmt(before, digits)} → {fmt(after, digits)}{unit}<strong>{signed(after - before, digits)}{unit === '%' ? ' pp' : unit}</strong></dd></div>
          })}</dl>
          <label className="field item-chart-select">Graph stat<select value={metric} onChange={(event) => setMetric(event.target.value as Metric)}>
            {(Object.keys(metrics) as Metric[]).map((stat) => <option key={stat} value={stat}>{metrics[stat][0]}</option>)}
          </select></label>
          <LineChart points={chartLevels} title={metrics[metric][0] + ' by hero level'} comparisonLabel="Without item" primaryLabel="With item" />
        </>}
        {habit && <div className="item-history"><h3>Your first purchase timing</h3>
          <LineChart points={habit.history.map((entry, index) => ({ label: 'Match ' + (index + 1), y: entry.time / 60 }))} title="Purchase minute by match" />
          <div className="chips">{habit.history.slice(-8).map((entry) => <button type="button" key={entry.id} onClick={() => onMatch(entry.id)}>{clock(entry.time)} · {entry.won ? 'Win' : 'Loss'} · {entry.id}</button>)}</div>
        </div>}
      </section>

      <section className="panel item-panel plan-panel">
        <header className="panel-heading"><div><h2>Plan your build</h2><p>Order up to {maxPlanItems} permanent items. Approve the plan to save it for this hero.</p></div></header>
        <div className="actions">
          {learned.usual.length > 0 && <button type="button" className="button slim" disabled={saving || !planReady} onClick={() => replace(learned.usual)}>Use my usual items</button>}
          {publicCore.length > 0 && <button type="button" className="button slim" disabled={saving || !planReady} onClick={() =>
            replace([...new Set(publicCore)].filter((entry) => selectableItems.includes(entry)).slice(0, 3))}>Use popular items</button>}
        </div>
        <div className="item-controls"><label className="field">Add item to plan<select value="" disabled={saving || !planReady || order.length >= maxPlanItems} onChange={(event) => replace([...order, event.target.value])}>
          <option value="" disabled>Choose an item</option>{selectableItems.filter((entry) => !order.includes(entry)).map((entry) => <option key={entry} value={entry}>{items[entry].n}</option>)}
        </select></label>
          <button type="button" className="button slim" disabled={saving || !planReady || !canPlan(inspected) || order.includes(key) || order.length >= maxPlanItems}
            onClick={() => replace([...order, key])}><Plus size={14} /> Add inspected item</button>
        </div>
        <ol className="build-order">{order.map((entry, index) => <li key={entry}>
          <button type="button" className="text-button" onClick={() => onItem(entry)}>{items[entry].n}</button>
          <small>{fmt(items[entry].c)}g{curve?.buys[index] ? ' · ' + clock(curve.buys[index].t * 60) : ''}</small>
          <div className="build-order-actions">
            <button type="button" className="icon-button" aria-label={'Move ' + items[entry].n + ' earlier'} disabled={saving || index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></button>
            <button type="button" className="icon-button" aria-label={'Move ' + items[entry].n + ' later'} disabled={saving || index === order.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></button>
            <button type="button" className="icon-button" aria-label={'Remove ' + items[entry].n} disabled={saving} onClick={() => replace(order.filter((candidate) => candidate !== entry))}><X size={14} /></button>
          </div>
        </li>)}</ol>
        <div className="actions">
          <button type="button" className="button primary" disabled={!planReady || saving || !dirty} onClick={() => void save()}><Check size={15} />{saving ? 'Saving…' : order.length ? 'Approve build' : 'Clear approved build'}</button>
          {dirty && <button type="button" className="button slim" disabled={saving} onClick={() => replace(approved)}>Revert edits</button>}
          {!dirty && approved.length > 0 && <span className="fine-print">Approved</span>}
        </div>
        <Feedback error message={planError} /><Feedback message={message} />
        {order.length > 0 && <>
          <h3>Projected timings</h3>
          <div className="item-controls">
            <label className="field">Gold per minute<input type="number" min="50" max="2500" placeholder={String(defaultGpm)} value={gpm} onChange={(event) => setGpm(event.target.value)} /></label>
            <label className="field">XP per minute<input type="number" min="50" max="2500" placeholder={String(defaultXpm)} value={xpm} onChange={(event) => setXpm(event.target.value)} /></label>
          </div>
          <p className="fine-print">{learned.gpm ? 'Defaults use your recent hero averages where available.' : 'Defaults use hero benchmarks where available.'} Timings assume 600 starting gold and constant income.</p>
          {!paceValid && <p className="fine-print">Use a gold and XP rate from 50 to 2,500 per minute.</p>}
          {learned.usual.length > 0 && <label className="check-field"><input type="checkbox" checked={compareUsual} onChange={(event) => setCompareUsual(event.target.checked)} /> Compare with my usual build</label>}
          {curve && <LineChart points={curve.points.map((point, index) => ({
            label: point.t + 'm', y: score(point, metric),
            comparison: score(usualCurve?.points[index] ?? gearAt(kit!, point.level, [], treads, hero.ranged), metric),
          }))} title={metrics[metric][0] + ' by match minute'} comparisonLabel={usualCurve ? 'Usual build' : 'Hero only'} primaryLabel="Planned build" />}
        </>}
      </section>
    </div>
  </>
}
