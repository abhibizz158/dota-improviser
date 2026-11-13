import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, BookOpen, ChevronDown, ChevronUp, Crosshair, RefreshCw, Search, ShieldCheck, Swords, X } from 'lucide-react'
import type { AppApi, Build, Catalog, Hero, LiveState, Role, SourceResult } from '../shared/model'
import { roles } from '../shared/model'
import { demoBuild } from './demo'
import { counterTips } from '../shared/guide'
import { FEATURE_LABELS } from '../shared/mechanics'
import type { Analysis } from '../shared/model'
import { Empty, Feedback, fmt, Portrait, WinMeter } from './ui'

const ItemPlanner = lazy(() => import('./item-planner').then((module) => ({ default: module.ItemPlanner })))

type DraftProps = { api: AppApi; catalog: Catalog; sample: boolean; live: LiveState; account: string; onMatch: (id: string) => void }
const stageLabels: Record<keyof Build, string> = { starting: 'Starting items', early: 'Early game', mid: 'Mid game', late: 'Late game' }
const situational = [
  { item: 'black_king_bar', reason: 'Consider spell protection if enemy disables stop you from staying in fights.' },
  { item: 'force_staff', reason: 'Create distance from melee threats or reposition an ally out of danger.' },
  { item: 'spirit_vessel', reason: 'Consider healing reduction against sustain-heavy lineups.' },
  { item: 'blink', reason: 'Reach priority targets if your hero needs to initiate from outside vision.' },
]

function Picker({ label, chosen, heroes, excluded, limit, onChange }: {
  label: string; chosen: number[]; heroes: Hero[]; excluded: number[]; limit: number; onChange: (ids: number[]) => void
}) {
  return <div className="hero-picker"><label><span>{label} <small>{chosen.length}/{limit}</small></span>
    <select disabled={chosen.length >= limit} value="" onChange={(event) => onChange([...chosen, Number(event.target.value)])}>
      <option value="" disabled>Add hero…</option>{heroes.filter((hero) => !chosen.includes(hero.id) && !excluded.includes(hero.id))
        .map((hero) => <option value={hero.id} key={hero.id}>{hero.name}</option>)}
    </select></label>
    {chosen.length > 0 && <div className="chips">{chosen.map((id) => {
      const name = heroes.find((hero) => hero.id === id)?.name ?? 'Hero ' + id
      return <button type="button" key={id} onClick={() => onChange(chosen.filter((value) => value !== id))} aria-label={'Remove ' + name}>{name}<X size={12} /></button>
    })}</div>}
  </div>
}

const statusLabel: Record<string, string> = { stun: 'stun', hex: 'hex', sleep: 'sleep', fear: 'fear', taunt: 'taunt', root: 'root', silence: 'silence', disarm: 'disarm', knockback: 'displace', slow: 'slow', blind: 'blind', break: 'break', mute: 'mute' }

function DamageBar({ label, damage }: { label: string; damage: { phys: number; mag: number; pure: number } }) {
  return <div className="dmg-row"><span>{label}</span><div className="dmg-bar" role="img" aria-label={`${label}: ${Math.round(damage.phys * 100)}% physical, ${Math.round(damage.mag * 100)}% magical, ${Math.round(damage.pure * 100)}% pure`}>
    <i className="phys" style={{ width: damage.phys * 100 + '%' }} /><i className="mag" style={{ width: damage.mag * 100 + '%' }} /><i className="pure" style={{ width: damage.pure * 100 + '%' }} /></div>
    <small>{Math.round(damage.phys * 100)}% phys · {Math.round(damage.mag * 100)}% magic · {Math.round(damage.pure * 100)}% pure</small></div>
}

/** What the lineups are made of (computed from every ability and stat) and what to change about it. */
function LineupAnalysis({ analysis, catalog }: { analysis: Analysis; catalog: Catalog }) {
  const { enemy, ally, fixes, model } = analysis
  if (!enemy && !ally) return null
  const chips = (p: NonNullable<Analysis['enemy']>) => Object.entries(p.control).filter(([k]) => statusLabel[k]).sort((a, b) => b[1] - a[1]).map(([k, n]) => <span key={k} className="status-chip">{statusLabel[k]} ×{n}</span>)
  return <div className="analysis">
    <h3>Lineup analysis (computed from stats and abilities)</h3>
    {enemy && <><DamageBar label="Enemy" damage={enemy.damage} /><div className="status-row">{chips(enemy)}{enemy.piercing > 0 && <span className="status-chip pierce">{enemy.piercing} pierce BKB</span>}{enemy.stealth > 0 && <span className="status-chip">stealth ×{enemy.stealth}</span>}</div></>}
    {ally && <><DamageBar label="Your team" damage={ally.damage} /><div className="status-row">{chips(ally)}</div></>}
    {fixes.length > 0 && <div className="fixes"><h3>What to change</h3>{fixes.map((f) => <div key={f.id} className="fix"><b>{f.title}</b><p>{f.detail}</p>{f.items.length > 0 && <div className="item-chips">{f.items.map((k) => <span key={k}>{catalog.items[k] ?? k}</span>)}</div>}</div>)}</div>}
    {model && <p className="fine-print">Mechanics are calibrated on {model.samples.toLocaleString()} real hero matchups (fit {Math.round(model.r2 * 100)}% of the variation beyond overall hero strength). Matters most: {model.importance.slice(0, 3).map((m) => FEATURE_LABELS[m.name].split(' (')[0].toLowerCase()).join(', ')}.</p>}
  </div>
}

export function Draft({ api, catalog, sample, live, account, onMatch }: DraftProps) {
  const [tab, setTab] = useState<'draft' | 'build'>('draft')
  const [heroId, setHeroId] = useState(44)
  const [item, setItem] = useState('')
  const chooseHero = (id: number) => { setItem(''); setHeroId(id) }
  const [build, setBuild] = useState<SourceResult<Build> | null>(null)
  const [valve, setValve] = useState<Partial<Record<keyof Build, string[]>> | null>(null)
  const [error, setError] = useState('')
  const [buildLoading, setBuildLoading] = useState(false)
  const [buildError, setBuildError] = useState('')
  const [buildRefresh, setBuildRefresh] = useState(0)
  const { draft } = live
  const advice = useMemo(() => counterTips(draft.enemy, catalog.heroes), [draft.enemy, catalog])
  const set = (input: Parameters<AppApi['draft']>[0]) => { setError(''); void api.draft(input).catch((reason: Error) => setError(reason.message)) }

  useEffect(() => {
    if (tab !== 'build') return
    let current = true
    setBuildLoading(true); setBuild(null); setBuildError(''); setValve(null)
    const slug = catalog.heroes.find((hero) => hero.id === heroId)?.slug ?? ''
    void api.defaultBuild(slug).then((value) => { if (current) setValve(value) }).catch(() => {})
    void api.build(heroId).catch((reason: Error) => {
      if (sample) return demoBuild() // browser preview has no main process
      throw reason
    }).then((value) => { if (current) setBuild(value) })
      .catch((reason: Error) => { if (current) setBuildError(reason.message) })
      .finally(() => { if (current) setBuildLoading(false) })
    return () => { current = false }
  }, [api, tab, heroId, sample, buildRefresh, catalog])

  const selected = catalog.heroes.find((hero) => hero.id === heroId)
  const name = (id: number) => catalog.heroes.find((hero) => hero.id === id)?.name ?? 'Hero ' + id

  return <>
    <div className="page-heading"><div><h1>Draft &amp; builds</h1><p>Pre-learned counters, refreshed from live data and your own matches.</p></div>
      <div className="segment" aria-label="Draft or builds">
        <button aria-pressed={tab === 'draft'} onClick={() => setTab('draft')}><Swords size={16} /> Draft assistant</button>
        <button aria-pressed={tab === 'build'} onClick={() => setTab('build')}><BookOpen size={16} /> Build planner</button>
      </div>
    </div>
    {live.pick && <div className="reveal-banner"><Swords size={15} /><span>You are <b>{live.pick.team}</b>{live.pick.heroId ? ', locked ' + name(live.pick.heroId) : ', not locked yet'}.
      {draft.activeTeam ? ' ' + draft.activeTeam + ' is picking' + (draft.timeLeft != null ? ' (' + Math.round(draft.timeLeft) + 's)' : '') + '.' : ''} Picks Dota reveals are added automatically; type any it hides.</span></div>}
    {draft.bans.length > 0 && <div className="team-row bans"><span className="team-label">Bans</span>{draft.bans.map((id) => <Portrait key={id} hero={catalog.heroes.find((h) => h.id === id)} />)}</div>}
    {draft.patchChanged && <Feedback message="Dota updated since last run. Cached matchups were dropped and will refresh as you draft." />}
    {draft.stale && !draft.patchChanged && <Feedback message="Bundled counters predate this game build. Live data is blended in; run npm run seed to refresh the offline table." />}
    {tab === 'draft' ? <div className="detail-grid draft-grid">
      <section className="panel form-panel">
        <header className="panel-heading"><div><h2>Draft inputs</h2><p>Enter picks as they reveal. Overlay hotkey: Ctrl/⌘ + Shift + F9.</p></div><Crosshair size={19} className="quiet-icon" /></header>
        <label className="field">Preferred role<select value={draft.role} onChange={(event) => set({ role: event.target.value as Role })}>{roles.map((role) => <option key={role}>{role}</option>)}</select></label>
        <Picker label="Enemy picks" chosen={draft.enemy} heroes={catalog.heroes} excluded={draft.allied} limit={5} onChange={(enemy) => set({ enemy })} />
        <Picker label="Ally picks" chosen={draft.allied} heroes={catalog.heroes} excluded={draft.enemy} limit={5} onChange={(allied) => set({ allied })} />
        <Picker label="Your hero pool" chosen={draft.pool} heroes={catalog.heroes} excluded={[]} limit={24} onChange={(pool) => set({ pool })} />
        <p className="fine-print">Empty pool = every hero. {draft.personal > 0 ? 'Learning from ' + fmt(draft.personal) + ' weighted games of yours.' : 'Add your account and open matches to start personal learning.'}</p>
        {(draft.enemy.length + draft.allied.length + draft.pool.length) > 0 && <button className="button secondary" onClick={() => set({ enemy: [], allied: [], pool: [] })}>Clear picks</button>}
      </section>
      <section className="panel recommendations">
        <header className="panel-heading"><div><h2>Hero suggestions</h2><p>Seed + live + you{draft.loading ? ' · refreshing…' : ''}</p></div><ShieldCheck size={19} className="quiet-icon" /></header>
        <Feedback error message={error} />
        {!draft.enemy.length && !draft.allied.length ? <Empty title="Add the picks you can see">Enemy heroes drive counter picks. Ally heroes drive team balance.</Empty> :
          <>
            <WinMeter allied={draft.teamWin} />
            <LineupAnalysis analysis={draft.analysis} catalog={catalog} />
            {advice.length > 0 && <div className="advice"><h3>Lineup advice (items and lane)</h3>{advice.map((t) => <div key={t.text} className={'tip ' + t.level}><p>{t.text}</p>
              {t.items && <div className="item-chips">{t.items.map((k) => <span key={k}>{catalog.items[k] ?? k}</span>)}</div>}</div>)}</div>}
            {draft.suggestions.length ? <div className="recommendation-list">{draft.suggestions.map((item, rank) => <details className="candidate" key={item.heroId} open={rank === 0}>
              <summary><span className="rank">{rank + 1}</span><Portrait hero={catalog.heroes.find((hero) => hero.id === item.heroId)} />
                <span className="candidate-name"><strong>{name(item.heroId)}{draft.patched.includes(item.heroId) && <em className="patched">patched</em>}</strong>
                  <small>{item.edge != null && <span className={item.edge >= 0 ? 'positive' : 'negative'}>edge {item.edge >= 0 ? '+' : ''}{fmt(item.edge, 1)}</span>}{item.edge != null && ' · '}{item.base != null && 'base ' + fmt(item.base, 1) + '% · '}{item.fit ? 'fits ' + draft.role.toLowerCase() : 'off-role'}{item.comfort != null && ' · you ' + (item.comfort >= 0 ? '+' : '') + fmt(item.comfort, 0)}</small></span>
                <span className="candidate-data"><strong>{item.winRate == null ? '—' : fmt(item.winRate, 1) + '%'}</strong><small>{item.teamWin != null ? 'lineup ' + fmt(item.teamWin, 1) + '%' : 'win vs lineup'}</small></span></summary>
              <div className="candidate-detail">
                {item.why.map((why) => <p key={why.enemy}>vs {name(why.enemy)} · <b className={why.edge >= 0 ? 'positive' : 'negative'}>{fmt(why.rate * 100, 1)}%</b> <small>(edge {why.edge >= 0 ? '+' : ''}{fmt(why.edge, 1)} · {fmt(why.games)} games · {why.source})</small>
                  <button className="text-button" aria-label="Nudge up" onClick={() => void api.nudge(item.heroId, why.enemy, 1)}><ChevronUp size={14} /></button>
                  <button className="text-button" aria-label="Nudge down" onClick={() => void api.nudge(item.heroId, why.enemy, -1)}><ChevronDown size={14} /></button></p>)}
                {item.mech && item.mech.parts.length > 0 && <div className="why-mech"><h3>Why, by the game's rules</h3>{item.mech.parts.map((p) => <p key={p.label}><span className={p.points >= 0 ? 'positive' : 'negative'}>{p.points >= 0 ? '+' : ''}{fmt(p.points, 1)}</span> {FEATURE_LABELS[p.label]}</p>)}</div>}
                {item.build && (item.build.early.length + item.build.mid.length + item.build.late.length > 0) && <div className="build-line">
                  {(['early', 'mid', 'late'] as const).map((phase) => item.build![phase].length > 0 && <div key={phase}><h3>{phase} items</h3><div className="item-chips">{item.build![phase].map((k) => <span key={k}>{catalog.items[k] ?? k}</span>)}</div></div>)}</div>}
                <button className="text-button" onClick={() => { chooseHero(item.heroId); setTab('build') }}>Open build planner <ArrowUpRight size={14} /></button>
              </div>
            </details>)}</div> : <Empty title="No matching suggestions">Try a different position or pool.</Empty>}
            {draft.avoid.length > 0 && <div className="avoid"><h3>Avoid against this lineup</h3>{draft.avoid.map((item) => <div key={item.heroId}><Portrait hero={catalog.heroes.find((hero) => hero.id === item.heroId)} /><span>{name(item.heroId)}</span><b className="negative">{item.winRate == null ? '—' : fmt(item.winRate, 1) + '%'}</b><small>edge {fmt(item.edge ?? 0, 1)}</small></div>)}</div>}
            <p className="fine-print"><b>Win vs lineup</b> is the estimated win rate against these exact heroes. <b>Edge</b> is how much better or worse that is than the two heroes' overall strength predicts, so it isolates real counters from heroes that are simply strong. <b>Base</b> is the hero's overall win rate. Ranking weighs edge most, then position fit, team balance and your comfort. Sources: seed (patch {draft.seedPatch || 'n/a'}), live OpenDota, your matches. Self-learning: {draft.model.samples} matches fitted, comfort weight {draft.model.comfortWeight}. Nudges are ±2 points per click.</p>
          </>}
      </section>
    </div> : <>
      <section className="panel standalone build-heading"><div className="review-hero"><Portrait hero={selected} /><div><h2>{selected?.name ?? 'Build planner'}</h2><p>OpenDota item purchase counts by game phase</p></div></div>
        <label className="field">Hero<select value={heroId} onChange={(event) => chooseHero(Number(event.target.value))}>{catalog.heroes.map((hero) => <option value={hero.id} key={hero.id}>{hero.name}</option>)}</select></label>
        <button className="button secondary" onClick={() => void api.openExternal('guides')}>Steam Hero Builds <ArrowUpRight size={15} /></button>
      </section>
      {selected && <Suspense fallback={<section className="panel"><Empty title="Loading build planner" /></section>}><ItemPlanner key={heroId + ':' + account} api={api} hero={selected} account={account} enabled={live.settings.features.learning} live={live}
        item={item} onItem={setItem} build={build?.data} upgrades={catalog.upgrades?.[heroId]} situational={advice.flatMap((tip) => (tip.items ?? []).map((key) => ({ key, reason: tip.text })))} onMatch={onMatch} /></Suspense>}
      <Feedback error message={buildError} />
      {buildError && <button className="button secondary slim" onClick={() => setBuildRefresh((value) => value + 1)}>Retry item data</button>}
      {buildLoading ? <section className="panel"><Empty title="Loading item usage" /></section> : build && <div className="build-grid">
        {(Object.keys(stageLabels) as (keyof Build)[]).map((stage) => <section className="panel build-panel" key={stage}>
          <header className="panel-heading"><div><h2>{stageLabels[stage]}</h2><p>{sample ? 'Sample purchase counts' : (build.stale ? 'Cached · ' : 'Refreshed ') + new Date(build.updatedAt).toLocaleString()}</p></div><Search size={16} className="quiet-icon" /></header>
          {build.data[stage].length ? build.data[stage].map(({ item, count }) => <div key={item} className="item-row">
            <button type="button" className="text-button" onClick={() => setItem(item)}>{catalog.items[item] ?? item}</button><strong>{fmt(count)}</strong>
          </div>) : <Empty title="No item usage data" />}
        </section>)}
      </div>}
      {valve && <section className="panel situational-panel"><header className="panel-heading"><div><h2>Valve default build</h2><p>Read from your installed game files</p></div><RefreshCw size={16} className="quiet-icon" /></header>
        <div className="situational-grid">{(Object.keys(stageLabels) as (keyof Build)[]).map((stage) => <article key={stage}><h3>{stageLabels[stage]}</h3>
          <p>{(valve[stage] ?? []).map((item) => catalog.items[item] ?? item).join(' · ') || '—'}</p></article>)}</div></section>}
      <section className="panel situational-panel"><header className="panel-heading"><div><h2>Situational choices</h2><p>General item decisions for different matchups</p></div></header>
        <div className="situational-grid">{situational.map(({ item, reason }) => <article key={item}><h3><button type="button" className="text-button" onClick={() => setItem(item)}>{catalog.items[item] ?? item}</button></h3><p>{reason}</p></article>)}</div>
      </section>
    </>}
  </>
}
