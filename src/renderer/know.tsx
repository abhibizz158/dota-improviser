import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, BookOpen, BrainCircuit, Search, ShieldAlert, Swords, X } from 'lucide-react'
import type { AppApi, Catalog, Hero, LiveState, PuterStatus } from '../shared/model'
import { counterTips } from '../shared/guide'
import { counterCombinations, estimatePurchase } from '../shared/timing'
import type { ItemInfo } from '../shared/items'
import { Empty, Feedback, Portrait, fmt } from './ui'
import items from 'virtual:dota-items'

type Props = { api: AppApi; catalog: Catalog; live: LiveState; puter: PuterStatus }
const itemInfo = items as Record<string, ItemInfo>

export function Know({ api, catalog, live, puter }: Props) {
  const [query, setQuery] = useState('')
  const [enemyIds, setEnemyIds] = useState<number[]>([])
  const [enemyToAdd, setEnemyToAdd] = useState('')
  const [enemyDetail, setEnemyDetail] = useState<Awaited<ReturnType<AppApi['heroDetail']>> | null>(null)
  const [counterLoading, setCounterLoading] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [terms, setTerms] = useState<Awaited<ReturnType<AppApi['searchKnowledge']>>>([])
  const [searching, setSearching] = useState(false)
  const liveOwn = live.status === 'Live' || live.status === 'Paused' ? live : null
  const ownHero = catalog.heroes.find((hero) => hero.slug === liveOwn?.lane?.heroSlug)
  const lineupTips = useMemo(() => counterTips(enemyIds, catalog.heroes), [enemyIds, catalog.heroes])
  const counterItems = [...new Map(lineupTips.flatMap((tip) => (tip.items ?? []).map((key) => [key, { key, reason: tip.text } as const]))).values()]
    .filter(({ key }) => itemInfo[key]?.c > 0)
    .map(({ key, reason }) => ({ key, cost: itemInfo[key].c, name: itemInfo[key].n, reason }))
  const packages = counterCombinations(counterItems, 8)

  useEffect(() => {
    let current = true
    if (!enemyIds.length) { setEnemyDetail(null); return }
    setCounterLoading(true)
    void api.heroDetail(enemyIds[0], false).then((detail) => { if (current) setEnemyDetail(detail) })
      .catch((reason: Error) => { if (current) setError(reason.message) })
      .finally(() => { if (current) setCounterLoading(false) })
    return () => { current = false }
  }, [api, enemyIds])

  useEffect(() => {
    if (!query.trim()) { setTerms([]); setSearching(false); return }
    let current = true
    setSearching(true)
    const id = setTimeout(() => {
      void api.searchKnowledge(query).then((results) => { if (current) setTerms(results) }).finally(() => { if (current) setSearching(false) })
    }, 150)
    return () => { current = false; clearTimeout(id) }
  }, [api, query])

  function addEnemy() {
    const id = Number(enemyToAdd)
    if (!id || enemyIds.includes(id) || enemyIds.length >= 5) return
    setEnemyIds((current) => [...current, id]); setEnemyToAdd(''); setAnswer('')
  }

  async function ask() {
    setBusy(true); setError(''); setAnswer('')
    try {
      const result = await api.puterAsk(question, {
        heroId: ownHero?.id,
        enemyIds,
        itemKeys: counterItems.map(({ key }) => key),
        ...(liveOwn?.lane ? { clockSeconds: liveOwn.lane.clock } : {}),
        ...(liveOwn?.coach?.gpm != null ? { gpm: liveOwn.coach.gpm } : {}),
        ...(liveOwn?.coach?.stats.gold != null ? { gold: liveOwn.coach.stats.gold } : {}),
      })
      setAnswer(result)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Puter could not answer this question.') }
    finally { setBusy(false) }
  }

  return <>
    <div className="page-heading"><div><h1>Know</h1><p>Look up Dota concepts, compare counter picks and plan item timings.</p></div><span className={'status-pill ' + (puter.connected ? 'connected' : '')}><i />{puter.connected ? 'Puter AI connected' : 'Offline reference ready'}</span></div>
    <div className="know-grid">
      <section className="panel form-panel know-counter">
        <header className="panel-heading"><div><h2>Hero counter lookup</h2><p>Individual public matchup results. Use Draft &amp; Builds for full lineup and role fit.</p></div><Swords size={18} className="quiet-icon" /></header>
        <label className="field">Enemy hero<select value={enemyToAdd} disabled={enemyIds.length >= 5} onChange={(event) => { setEnemyToAdd(event.target.value); if (event.target.value) { const id = Number(event.target.value); setEnemyIds((current) => current.includes(id) ? current : [...current, id]); setEnemyToAdd(''); setAnswer('') } }}>
          <option value="">Add a revealed or manually selected hero</option>{catalog.heroes.filter((hero) => !enemyIds.includes(hero.id)).map((hero) => <option key={hero.id} value={hero.id}>{hero.name}</option>)}
        </select></label>
        {enemyIds.length > 0 && <div className="chips">{enemyIds.map((id) => <button key={id} type="button" onClick={() => { setEnemyIds((current) => current.filter((value) => value !== id)); setAnswer('') }} aria-label={'Remove ' + catalog.heroes.find((hero) => hero.id === id)?.name}>{catalog.heroes.find((hero) => hero.id === id)?.name}<X size={12} /></button>)}</div>}
        {counterLoading ? <Empty title="Loading matchup data" /> : enemyDetail?.weakAgainst.length ? <div className="know-counter-list"><h3>Heroes that counter {catalog.heroes.find((hero) => hero.id === enemyIds[0])?.name}</h3>
          {enemyDetail.weakAgainst.slice(0, 6).map((row) => <div key={row.heroId}><Portrait hero={catalog.heroes.find((hero) => hero.id === row.heroId)} /><strong>{catalog.heroes.find((hero) => hero.id === row.heroId)?.name ?? 'Hero'}</strong><b>{fmt(row.rate, 1)}%</b><small>{fmt(row.games)} games · individual matchup</small></div>)}</div>
          : <Empty title={enemyIds.length ? 'No matchup rows available' : 'Choose an enemy hero'}>Results use public hero aggregates and show their game sample.</Empty>}
        {lineupTips.length > 0 && <div className="know-threats"><h3>Item and lane answers</h3>{lineupTips.map((tip) => <article key={tip.text}><p>{tip.text}</p>{tip.items?.map((key) => <button className="text-button" key={key} onClick={() => setQuestion(`When should I build ${itemInfo[key]?.n ?? key} against this lineup?`)}>{itemInfo[key]?.n ?? key}</button>)}</article>)}</div>}
      </section>

      <section className="panel form-panel know-timing">
        <header className="panel-heading"><div><h2>Counter-item timing</h2><p>Compare cheap answers with expensive spikes.</p></div><ShieldAlert size={18} className="quiet-icon" /></header>
        {counterItems.length ? <div className="know-packages">{packages.map((group) => {
          const cost = group.reduce((sum, item) => sum + item.cost, 0)
          const estimate = estimatePurchase({
            nowSeconds: liveOwn?.lane?.clock ?? null,
            gold: liveOwn?.coach?.stats.gold ?? null,
            gpm: liveOwn?.coach?.gpm ?? null,
            cost,
          })
          return <article key={group.map((item) => item.key).join('+')}>
            <div><strong>{group.map((item) => item.name).join(' → ')}</strong><span>{fmt(cost)}g · {estimate.stage} {group.length > 1 ? 'combination' : 'counter'}</span></div>
            <p>{group[0].reason}</p>
            <small>{estimate.note} {estimate.downside}</small>
          </article>
        })}</div> : <Empty title="Add an enemy to see counter items">Item packages use matchup traits; current own GPM and unspent gold improve the timing estimate.</Empty>}
        <p className="fine-print">Timing holds your observed GPM constant. Lane income can change; this is a planning estimate, not a target that overrides defense, components or your team’s next timing.</p>
      </section>
    </div>

    <section className="panel form-panel know-ai">
      <header className="panel-heading"><div><h2>Ask the strategy coach</h2><p>Grounded in selected heroes, app item data and your own practice feed.</p></div><BrainCircuit size={19} className="quiet-icon" /></header>
      <label className="field">Your question<textarea rows={3} maxLength={1200} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Example: I’m behind in lane against this matchup. Should I buy an early defensive item or keep building my core?" /></label>
      <div className="actions"><button className="button primary" disabled={!puter.connected || busy || !question.trim()} onClick={() => void ask()}>{busy ? 'Thinking…' : 'Ask Puter AI'} <ArrowRight size={15} /></button><span className="fine-print">{puter.connected ? `Model: ${puter.model}` : 'Connect Puter AI in Settings to ask.'}</span></div>
      <p className="fine-print">Sent to Puter: your typed question, selected hero/picks/items and, only in a supported practice session, your own clock, GPM and unspent gold. Steam ID and match history are excluded. Availability and quotas follow Puter’s account plan.</p>
      <Feedback error message={error} />
      {answer && <article className="know-answer"><h3>Strategy notes</h3><p>{answer}</p></article>}
    </section>

    <section className="panel form-panel know-glossary">
      <header className="panel-heading"><div><h2>Dota reference</h2><p>Search for a hero-counter, lane or item term.</p></div><BookOpen size={18} className="quiet-icon" /></header>
      <label className="field know-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search terms, mechanics, item timing…" /></label>
      {terms.length ? <div className="knowledge-list">{terms.map((entry) => <article key={entry.id}><h3>{entry.title}<small className="know-kind">{entry.kind}</small></h3><p>{entry.body}</p></article>)}</div>
        : searching ? <Empty title="Searching…" /> : query.trim() ? <Empty title="No matching term">Try a hero name, item, patch or mechanic.</Empty> : <Empty title="Search the whole database">Every hero's kit, every item and recent patch notes, plus the mechanics glossary.</Empty>}
    </section>
  </>
}
