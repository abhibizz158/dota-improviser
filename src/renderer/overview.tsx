import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowRight, CheckCircle2, ChevronRight, Coins, Crosshair, Flame, Gamepad2, History, RefreshCw, Swords, Target, TrendingUp, Trophy, XCircle, Zap } from 'lucide-react'
import type { AppApi, Catalog, LocalStatus, MatchSummary, SessionRecord, SourceResult } from '../shared/model'
import { roleLabels, roles } from '../shared/model'
import { available, summarize } from '../shared/analysis'
import { day, HistoryChart, rollingWins, Sparkline } from './charts'
import { clock, Empty, fmt, Portrait, Trend } from './ui'
import { FeaturedStage, GuideSections, Insights, useFeatured } from './featured'

type Props = {
  api: AppApi; onUseHero: (id: number) => void; showStyle?: boolean; catalog: Catalog; history: SourceResult<MatchSummary[]> | null; loading: boolean; demo: boolean; account: string;
  onAccount: () => void; onRefresh: () => void; onMatch: (id: string) => void; onImport: () => void; onPrivateHistory: () => void; onDraft: () => void; onOpenGame: () => void; local: LocalStatus;
}
const base = import.meta.env.BASE_URL

export function Overview({ api, onUseHero, showStyle = true, catalog, history, loading, demo, account, onAccount, onRefresh, onMatch, onImport, onPrivateHistory, onDraft, onOpenGame, local }: Props) {
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  useEffect(() => { void api.sessionHistory().then(setSessions).catch(() => {}) }, [api])
  const [hero, setHero] = useState('')
  const [role, setRole] = useState('')
  const [mode, setMode] = useState('')
  const [patch, setPatch] = useState('')
  const [page, setPage] = useState(0)
  const matches = history?.data ?? []
  const guideArea = useRef<HTMLDivElement>(null)
  const [loadGuide, setLoadGuide] = useState(false)
  const f = useFeatured(api, catalog, matches, loadGuide)
  useEffect(() => {
    const element = guideArea.current
    if (loadGuide || !element) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setLoadGuide(true)
        observer.disconnect()
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [loadGuide])
  const byId = useMemo(() => new Map(catalog.heroes.map((hero) => [hero.id, hero])), [catalog])
  const filtered = matches.filter((match) => (!hero || String(match.heroId) === hero) &&
    (!role || match.role === role) && (!mode || match.mode === mode) && (!patch || match.patch === patch))
  const recent = summarize(filtered.slice(0, 10))
  const previous = summarize(filtered.slice(10, 20))
  const trendContext = filtered.length >= 20 ? ' · Last 10 vs. previous 10' : filtered.length > 10 ? ' · Last 10 vs. previous ' + (filtered.length - 10) : ''
  const total = summarize(filtered)
  const change = (key: keyof typeof total) => {
    const a = recent[key], b = previous[key]
    return a == null || b == null ? null : a - b
  }
  const metrics = [
    { label: 'Win rate', value: total.winRate, digits: 1, suffix: '%', icon: Trophy, tone: 'orange', series: rollingWins(filtered.slice(0, 12)), change: change('winRate'), delta: ' pp', deltaDigits: 1 },
    { label: 'Avg. GPM', value: total.gpm, icon: Coins, tone: 'gold', series: available(filtered.slice(0, 10).toReversed().map((match) => match.gpm)), change: change('gpm') },
    { label: 'Avg. XPM', value: total.xpm, icon: Zap, tone: 'blue', series: available(filtered.slice(0, 10).toReversed().map((match) => match.xpm)), change: change('xpm') },
    { label: 'Avg. KDA', value: total.kda, digits: 2, icon: Crosshair, tone: 'purple', series: available(filtered.slice(0, 10).toReversed().map((match) => summarize([match]).kda)), change: change('kda'), delta: ' KDA', deltaDigits: 2 },
  ]
  const counts = [...new Set(filtered.map((match) => match.heroId))].map((id) => {
    const rows = filtered.filter((match) => match.heroId === id)
    return { id, games: rows.length, rate: summarize(rows).winRate }
  }).sort((a, b) => b.games - a.games || (b.rate ?? 0) - (a.rate ?? 0)).slice(0, 4)
  const lastPage = Math.max(0, Math.ceil(filtered.length / 6) - 1)
  const currentPage = Math.min(page, lastPage)
  const filter = (change: (value: string) => void) => (event: React.ChangeEvent<HTMLSelectElement>) => { change(event.target.value); setPage(0) }

  return <>
    <FeaturedStage f={f} catalog={catalog} demo={demo} account={account} localInstall={local.installFound} localBuilds={local.localBuilds} onAccount={onAccount} onImport={onImport} onUseHero={onUseHero} onOpenGame={onOpenGame} onDraft={onDraft} />

    <section aria-labelledby="performance-title">
      <div className="section-heading">
        <div><h2 id="performance-title">Your performance</h2><p>{filtered.length} {demo ? 'sample' : ''} {filtered.length === 1 ? 'match' : 'matches'}{trendContext}</p></div>
        <div className="section-actions">
          {!demo && history && <span className="fine-print">{history.stale ? 'Cached · ' : 'Updated '}{new Date(history.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
          {account && <button className="button secondary slim" disabled={loading} onClick={onRefresh}><RefreshCw size={15} className={loading ? 'spin' : ''} /> {loading ? 'Refreshing…' : 'Refresh'}</button>}
          {account && !demo && <button className="button secondary slim" onClick={onPrivateHistory}>Import own matches</button>}
        </div>
      </div>
      <div className="metrics-grid">
        {metrics.map(({ icon: Icon, ...metric }) => <article className="panel metric" key={metric.label}>
          <div className="metric-label"><span className={'metric-icon ' + metric.tone}><Icon size={17} /></span>{metric.label}</div>
          <div className="metric-number">{fmt(metric.value, metric.digits)}{metric.value != null && metric.suffix && <small>{metric.suffix}</small>}</div>
          <Trend value={metric.change} suffix={metric.delta} digits={metric.deltaDigits} />
          <Sparkline values={metric.series} />
        </article>)}
      </div>
    </section>

    <SessionHistory sessions={sessions} byId={byId} publicGpm={total.gpm} publicXpm={total.xpm} />

    <Insights f={f} catalog={catalog} matches={matches} showStyle={showStyle} />

    <div className="overview-grid">
      <HistoryChart matches={filtered} />
      <section className="panel hero-panel">
        <header className="panel-heading"><div><h2>Most played heroes</h2><p>In this match selection</p></div><Swords size={18} className="quiet-icon" /></header>
        {counts.length ? <div className="hero-list">
          {counts.map((entry) => <button type="button" className="hero-row" key={entry.id} onClick={() => { setHero(String(entry.id)); setPage(0) }}>
            <Portrait hero={byId.get(entry.id)} /><span className="hero-row-name"><strong>{byId.get(entry.id)?.name ?? 'Unknown hero'}</strong><small>{entry.games} {entry.games === 1 ? 'match' : 'matches'}</small></span>
            <span className={'hero-win ' + ((entry.rate ?? 0) >= 50 ? 'positive' : '')}>{fmt(entry.rate, 0)}{entry.rate != null && '%'}</span><ChevronRight size={14} />
          </button>)}
        </div> : <Empty title="No heroes in this selection" />}
        <button className="text-button hero-footer" onClick={onDraft}>Explore Draft &amp; Builds <ArrowRight size={15} /></button>
      </section>
    </div>

    <section className="panel matches-panel">
      <header className="panel-heading">
        <div><h2>Recent matches</h2><p>Open a match to review lane performance and item timings.</p></div>
        <div className="filter-row">
          <select aria-label="Filter by hero" value={hero} onChange={filter(setHero)}><option value="">All heroes</option>{[...new Set(matches.map((match) => match.heroId))].sort((a, b) => (byId.get(a)?.name ?? '').localeCompare(byId.get(b)?.name ?? '')).map((id) => <option key={id} value={id}>{byId.get(id)?.name ?? 'Hero ' + id}</option>)}</select>
          <select aria-label="Filter by role" value={role} onChange={filter(setRole)}><option value="">All roles</option>{roles.map((value) => <option key={value}>{value}</option>)}</select>
          <select aria-label="Filter by mode" value={mode} onChange={filter(setMode)}><option value="">All modes</option>{[...new Set(matches.map((match) => match.mode).filter(Boolean))].sort().map((value) => <option key={value}>{value}</option>)}</select>
          <select aria-label="Filter by patch" value={patch} onChange={filter(setPatch)}><option value="">All patches</option>{[...new Set(matches.map((match) => match.patch).filter(Boolean))].sort((a, b) => b.localeCompare(a, undefined, { numeric: true })).map((value) => <option key={value}>{value}</option>)}</select>
        </div>
      </header>
      {filtered.length ? <>
        <div className="match-table-wrap"><table className="match-table">
          <thead><tr><th>Hero</th><th>Result</th><th>K / D / A</th><th>GPM</th><th>XPM</th><th>LH / DN</th><th>Duration</th><th>Date</th><th><span className="sr-only">Review</span></th></tr></thead>
          <tbody>{filtered.slice(currentPage * 6, currentPage * 6 + 6).map((match) => <tr key={match.id}>
            <td><button className="match-name" onClick={() => onMatch(match.id)}><Portrait hero={byId.get(match.heroId)} /><span><strong>{byId.get(match.heroId)?.name ?? 'Unknown hero'}</strong><small>{match.source === 'local' ? 'Local scoreboard' : [match.role, match.mode].filter(Boolean).join(' · ') || 'Role unavailable'}</small></span></button></td>
            <td><span className={'result ' + (match.won == null ? '' : match.won ? 'win' : 'loss')}>{match.won == null ? 'Unknown' : match.won ? 'Victory' : 'Defeat'}</span>
              {match.status === 'abandoned' && <span className="status-tag abandoned">Abandoned</span>}</td>
            <td>{[match.kills, match.deaths, match.assists].map((number) => fmt(number)).join(' / ')}</td><td>{fmt(match.gpm)}</td><td>{fmt(match.xpm)}</td>
            <td>{fmt(match.lastHits)} / {fmt(match.denies)}</td><td>{clock(match.duration || null)}</td><td>{day(match.start)}</td>
            <td><button className="icon-button" onClick={() => onMatch(match.id)} aria-label={'Review match ' + match.id}><ChevronRight size={17} /></button></td>
          </tr>)}</tbody>
        </table></div>
        <div className="table-footer"><span>{currentPage * 6 + 1}–{Math.min((currentPage + 1) * 6, filtered.length)} of {filtered.length} matches</span>
          <div className="actions"><button className="button secondary slim" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><button className="button secondary slim" disabled={currentPage >= lastPage} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>
      </> : matches.length ? <Empty title="No matches fit these filters">Try a different hero, role, mode, or patch.</Empty> : <div className="history-empty">
        <Empty title={loading ? 'Loading your match history' : 'No match history returned'}>
          {account ? 'If you just turned on "Expose Public Match Data," OpenDota only backfills matches from then on and can take a few minutes to notice — try Refresh again shortly. If sharing is off, import your own completed match scoreboards instead.' : 'Link your Steam account, or open a completed match by ID.'}
        </Empty>
        <div className="actions"><button className="button secondary slim" onClick={onImport}>Open match by ID</button>{local.installFound && <button className="button secondary slim" onClick={onOpenGame}><Gamepad2 size={14} /> Open Dota 2</button>}</div>
      </div>}
    </section>
    <div className="bottom-meta"><span><Activity size={14} /> {demo ? 'Sample workspace' : 'History: public match data'}</span><span><Target size={14} /> {local.installFound ? 'Local Dota build ' + (local.build ?? 'found') : 'No local Dota install'}</span><span><TrendingUp size={14} /> {filtered.length} matches in view</span></div>
    <div ref={guideArea}>
      {loadGuide ? <GuideSections f={f} catalog={catalog} /> : <button type="button" className="button slim" onClick={() => setLoadGuide(true)}>Load hero guide</button>}
    </div>
  </>
}

/** Every own-feed game recorded locally while the listener was running (practice, normal or ranked alike), tagged
 * completed or abandoned (AGENTS.md's half-recorded rule: app/game closed or you left = abandoned, ancient fell = completed),
 * plus what those sessions say about your real pace next to your public match history. */
function SessionHistory({ sessions, byId, publicGpm, publicXpm }: { sessions: SessionRecord[]; byId: Map<number, Catalog['heroes'][number]>; publicGpm: number | null; publicXpm: number | null }) {
  if (!sessions.length) return null
  const completed = sessions.filter((s) => s.status === 'completed')
  const abandoned = sessions.length - completed.length
  const avg = (pick: (s: SessionRecord) => number | null) => {
    const values = sessions.map(pick).filter((v): v is number => v != null)
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
  }
  const sessionGpm = avg((s) => s.gpm), sessionXpm = avg((s) => s.xpm)
  const gpmDelta = sessionGpm != null && publicGpm != null ? sessionGpm - publicGpm : null
  const xpmDelta = sessionXpm != null && publicXpm != null ? sessionXpm - publicXpm : null
  return <section className="panel sessions-panel" aria-labelledby="sessions-title">
    <header className="panel-heading">
      <div><h2 id="sessions-title"><History size={17} className="quiet-icon" /> Recorded sessions</h2>
        <p>Every own-feed game while the listener ran, local-only &mdash; {completed.length} completed, {abandoned} abandoned.</p></div>
    </header>
    {(gpmDelta != null || xpmDelta != null) && <p className="fine-print">
      Across these recorded sessions you average {fmt(sessionGpm)} GPM and {fmt(sessionXpm)} XPM, versus {fmt(publicGpm)} GPM and {fmt(publicXpm)} XPM in your public match history
      {gpmDelta != null && Math.abs(gpmDelta) >= 15 ? (gpmDelta > 0 ? ' — noticeably faster lately.' : ' — noticeably slower lately.') : ' — consistent with your usual pace.'}
    </p>}
    <div className="match-table-wrap"><table className="match-table">
      <thead><tr><th>Hero</th><th>Status</th><th>K / D / A</th><th>GPM</th><th>XPM</th><th>Lane / type</th><th>Duration</th><th>Recorded</th></tr></thead>
      <tbody>{sessions.slice().reverse().slice(0, 8).map((session) => <tr key={session.at}>
        <td><button className="match-name"><Portrait hero={session.heroId != null ? byId.get(session.heroId) : undefined} /><span><strong>{byId.get(session.heroId ?? -1)?.name ?? session.hero.replace(/_/g, ' ')}</strong></span></button></td>
        <td><span className={'status-tag ' + session.status}>{session.status === 'completed' ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {session.status === 'completed' ? 'Completed' : 'Abandoned'}</span></td>
        <td>{[session.kills, session.deaths, session.assists].map((n) => fmt(n)).join(' / ')}</td><td>{fmt(session.gpm)}</td><td>{fmt(session.xpm)}</td>
        <td>{[session.lane && roleLabels[session.lane], session.gameType].filter(Boolean).join(' · ') || 'Not set'}</td>
        <td>{clock(session.clock || null)}</td><td>{day(Math.floor(session.at / 1000))}</td>
      </tr>)}</tbody>
    </table></div>
  </section>
}
