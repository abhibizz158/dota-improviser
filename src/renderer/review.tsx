import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Clock3, FileSearch, Flag, ListFilter, RefreshCw, Target } from 'lucide-react'
import type { AppApi, Catalog, MatchPlayer, MatchReview, MatchSummary, ReviewEvent, SourceResult } from '../shared/model'
import { atMinute, available, average, comparable } from '../shared/analysis'
import { demoHistory, demoReview } from './demo'
import { AdvChart, DiffChart, day, ReviewChart } from './charts'
import { clock, Empty, Feedback, fmt, Portrait } from './ui'

type Props = {
  api: AppApi; catalog: Catalog; account: string; id: string; sample: boolean;
  history: MatchSummary[]; onImport: () => void; onBack: () => void;
}

const eventTabs = ['All events', 'Items', 'Vision', 'Objectives', 'Deaths'] as const
const kinds: Record<(typeof eventTabs)[number], ReviewEvent['kind'] | ''> = {
  'All events': '', Items: 'item', Vision: 'vision', Objectives: 'objective', Deaths: 'death',
}

const clockOf = (t: number) => Math.floor(t / 60) + ':' + String(Math.round(t % 60)).padStart(2, '0')

/** Post-match objectives from the parsed replay: towers by tier and lane for each team, first blood, Roshan. `team` owns the building that fell. */
function ObjectiveTimeline({ timeline }: { timeline: NonNullable<MatchReview['timeline']> }) {
  const { towers } = timeline
  const first = towers[0]
  const rows = [1, 2, 3].flatMap((tier) => (['Top', 'Mid', 'Bot'] as const).map((lane) => ({ tier, lane })))
  const at = (team: 'Radiant' | 'Dire', tier: number, lane: string) => towers.find((t) => t.team === team && t.tier === tier && t.lane === lane)?.time
  const base = (team: 'Radiant' | 'Dire') => towers.filter((t) => t.team === team && t.tier === 4).map((t) => t.time)
  return <section className="panel events-panel reveal">
    <header className="panel-heading"><div><h2>Objective timeline</h2><p>When each building fell. Each column shows the team that lost it.</p></div></header>
    <div className="objective-chips">
      {timeline.firstBlood != null && <span className="chip epic">🩸 First blood {clockOf(timeline.firstBlood)}</span>}
      {first && <span className="chip good">🏰 First tower: {first.team === 'Radiant' ? 'Dire' : 'Radiant'} took {first.team}'s T{first.tier} {first.lane.toLowerCase()} at {clockOf(first.time)}</span>}
      {timeline.roshan.map((t, i) => <span key={i} className="chip hot">🛡 Roshan {i + 1} · {clockOf(t)}</span>)}
    </div>
    {towers.length ? <table className="match-table obj-table"><thead><tr><th>Tower</th><th>Radiant lost</th><th>Dire lost</th></tr></thead>
      <tbody>{rows.map(({ tier, lane }) => <tr key={tier + lane}><td>T{tier} · {lane}</td><td>{at('Radiant', tier, lane) != null ? clockOf(at('Radiant', tier, lane)!) : '—'}</td><td>{at('Dire', tier, lane) != null ? clockOf(at('Dire', tier, lane)!) : '—'}</td></tr>)}
        <tr><td>T4 · Base</td><td>{base('Radiant').map(clockOf).join(', ') || '—'}</td><td>{base('Dire').map(clockOf).join(', ') || '—'}</td></tr></tbody></table> : <Empty title="No building data" >Objectives appear once OpenDota has parsed the replay.</Empty>}
    {(timeline.goldAdv.length > 2 || timeline.xpAdv.length > 2) && <><h3 className="obj-sub">Gold and experience advantage (Dota's own graph)</h3><AdvChart gold={timeline.goldAdv} xp={timeline.xpAdv} /></>}
  </section>
}

export function Review({ api, catalog, account, id, sample, history, onImport, onBack }: Props) {
  const [result, setResult] = useState<SourceResult<MatchReview> | null>(null)
  const [slot, setSlot] = useState<number | null>(null)
  const [loading, setLoading] = useState(Boolean(id))
  const [error, setError] = useState('')
  const [parse, setParse] = useState<'idle' | 'pending' | 'requesting' | 'unavailable'>('idle')
  const [baseline, setBaseline] = useState<{ slot: number; players: MatchPlayer[] } | null>(null)
  const [loadingBaseline, setLoadingBaseline] = useState(false)
  const [baselineMessage, setBaselineMessage] = useState('')
  const [eventFilter, setEventFilter] = useState<(typeof eventTabs)[number]>('All events')
  const [eventLimit, setEventLimit] = useState(10)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let current = true
    if (!id) return
    setLoading(true)
    setError('')
    if (sample) {
      const row = demoHistory.find((match) => match.id === id)
      if (row) {
        const data = { id, players: [demoReview(row)], parsed: true, start: row.start, duration: row.duration, patch: row.patch }
        setResult({ data, updatedAt: Date.now(), stale: false })
      } else setError('Sample match unavailable.')
      setLoading(false)
    } else {
      void api.match(id, refresh > 0).then((value) => { if (current) setResult(value) })
        .catch((reason: Error) => { if (current) setError(reason.message) })
        .finally(() => { if (current) setLoading(false) })
    }
    return () => { current = false }
  }, [api, id, sample, refresh])

  useEffect(() => {
    if (!id || sample || !result || result.data.parsed || result.data.localOnly) return
    let active = true
    void api.parseStatus(id).then((state) => {
      if (!active || !state.jobId) return
      if (state.pending) setParse('pending')
      else setRefresh((value) => value + 1)
    }).catch(() => {})
    return () => { active = false }
  }, [api, id, sample, result])

  useEffect(() => {
    if (parse !== 'pending') return
    let current = true
    let next: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const state = await api.parseStatus(id)
        if (!current) return
        if (!state.pending) {
          const response = await api.match(id, true)
          if (!current) return
          setResult(response)
          setError('')
          setParse(response.data.parsed ? 'idle' : 'unavailable')
          return
        }
      } catch (reason) {
        if (!current) return
        setError(reason instanceof Error ? reason.message : 'Could not check the replay job.')
      }
      if (current) next = setTimeout(poll, 15000)
    }
    next = setTimeout(poll, 10000)
    return () => { current = false; clearTimeout(next) }
  }, [api, id, parse])

  const match = result?.data
  const player = match?.players.find((entry) => entry.slot === slot) ??
    match?.players.find((entry) => entry.accountId !== null && entry.accountId === account) ?? match?.players[0]
  const hero = catalog.heroes.find((hero) => hero.id === player?.heroId)
  const personal = Boolean(player && (sample || (account && player.accountId === account)))
  const personalRows = player && personal && player.role ? history.filter((row) => {
    // A history row can lack a position estimate that is present in the full match.
    return comparable(player, row.role == null ? { ...row, role: player.role } : row)
  }).slice(0, 8) : []
  const currentBaseline = sample && player
    ? personalRows.map(demoReview).filter((candidate) => comparable(player, candidate)) : baseline?.slot === player?.slot ? baseline?.players ?? [] : []

  async function loadBaseline() {
    if (!player || loadingBaseline) return
    setLoadingBaseline(true)
    setBaselineMessage('')
    try {
      const settled = await Promise.allSettled(personalRows.map((row) => api.match(row.id)))
      const comparisons = settled.flatMap((response) => response.status === 'fulfilled' ? response.value.data.players.filter((candidate) =>
        candidate.accountId === account && comparable(player!, candidate) && candidate.minutes.length > 0) : [])
      setBaseline({ slot: player.slot, players: comparisons })
      setBaselineMessage(comparisons.length ? (settled.some((entry) => entry.status === 'rejected') ? 'Some comparable matches could not be loaded.' : '') :
        'No comparable parsed matches were available in recent history.')
    } finally { setLoadingBaseline(false) }
  }

  async function requestParse() {
    setParse('requesting')
    setError('')
    try {
      const state = await api.requestParse(id)
      setParse(state.pending ? 'pending' : 'idle')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not request a parse.')
      setParse('idle')
    }
  }

  const currentTen = player && atMinute(player, 10)
  const referenceTen = average(available(currentBaseline.map((entry) => atMinute(entry, 10)?.lastHits)))
  const firstDeath = player?.events.find((entry) => entry.kind === 'death' && entry.time != null && entry.time >= 0 && entry.time <= 600)
  const firstItem = player?.events.find((entry) => entry.kind === 'item' && entry.time != null && entry.time >= 600)
  const focus = currentTen?.lastHits != null && referenceTen != null && currentTen.lastHits < referenceTen
    ? 'Aim for ' + Math.round(referenceTen) + ' last hits by 10:00. Review the waves between 5:00 and 10:00 in this replay.'
    : firstDeath ? 'Review ' + clock(firstDeath.time) + ' in the replay. Check the wave position and available escape routes before the death.'
      : firstItem ? 'Review ' + clock(firstItem.time) + ' in the replay and look for the first opportunity to use ' + firstItem.label + '.'
        : 'In your next match, record your last hits at 5:00 and 10:00 to set a lane benchmark.'
  const events = player?.events.filter((entry) => !kinds[eventFilter] || entry.kind === kinds[eventFilter]) ?? []

  return <>
    <div className="page-heading">
      <div><button className="text-button back-button" onClick={onBack}><ArrowLeft size={15} /> Overview</button>
        <h1>Match review</h1><p>{id ? 'Match ' + id + (sample ? ' · Sample data' : match?.start ? ' · ' + day(match.start, true) : '') : 'Review lane performance, decisions, and item timings.'}</p></div>
      <button className="button primary" onClick={onImport}><FileSearch size={17} /> Open match by ID</button>
    </div>
    <Feedback error message={error} />
    {!id && <section className="panel"><Empty title="Open a completed match">Enter a match ID or choose a match in Overview.</Empty></section>}
    {loading && !match && <section className="panel"><Empty title="Loading match details">Fetching data from OpenDota.</Empty></section>}
    {id && !loading && !match && <section className="panel"><Empty title="Match details unavailable">Check the match ID or try again.</Empty></section>}
    {match && player && <>
      <section className="panel review-summary">
        <div className="review-hero"><Portrait hero={hero} /><div><h2>{hero?.name ?? 'Unknown hero'}</h2><p>{[player.role && player.role + ' (estimated)', player.side, player.mode, player.patch && 'Patch ' + player.patch].filter(Boolean).join(' · ')}</p></div></div>
        <span className={'result ' + (player.won ? 'win' : 'loss')}>{player.won ? 'Victory' : 'Defeat'}</span>
        <span className="review-duration"><Clock3 size={16} />{clock(player.duration)}</span>
        {match.players.length > 1 && <select aria-label="Player perspective" value={player.slot} onChange={(event) => {
          setSlot(Number(event.target.value)); setBaseline(null); setBaselineMessage('')
        }}>{match.players.map((entry) => <option key={entry.slot} value={entry.slot}>{catalog.heroes.find((hero) => hero.id === entry.heroId)?.name ?? 'Unknown hero'} · {entry.side}{entry.accountId && entry.accountId === account ? ' (you)' : ''}</option>)}</select>}
        {!sample && <button className="icon-button" aria-label="Refresh match" onClick={() => setRefresh((value) => value + 1)} disabled={loading}><RefreshCw size={18} className={loading ? 'spin' : ''} /></button>}
      </section>
      {result.stale && <Feedback message={'Showing cached match data from ' + new Date(result.updatedAt).toLocaleString()} />}
      <div className="review-stats">
        {[['K / D / A', [player.kills, player.deaths, player.assists].map((number) => fmt(number)).join(' / ')],
          ['GPM', fmt(player.gpm)], ['XPM', fmt(player.xpm)], ['Last hits', fmt(player.lastHits)], ['Denies', fmt(player.denies)]].map(([label, value]) =>
          <article key={label} className="panel review-stat"><span>{label}</span><strong>{value}</strong></article>)}
      </div>
      {match.localOnly && <section className="panel standalone"><p>Local scoreboard. Replay charts and purchase timelines are unavailable for this entry.</p></section>}
      {!match.parsed && !match.localOnly && <section className="panel standalone">
        <div><h2>Replay data is unavailable</h2><p>{parse === 'pending' ? 'OpenDota is processing the replay. This view will refresh when it finishes.' :
          parse === 'unavailable' ? 'The parse job ended without detailed replay data. The replay may have expired.' :
            'The scoreboard is available. You can ask OpenDota to parse the replay for detailed stats.'}</p></div>
        <button className="button secondary" disabled={sample || parse === 'pending' || parse === 'requesting'} onClick={requestParse}>
          {parse === 'pending' ? 'Parse queued' : parse === 'requesting' ? 'Submitting…' : 'Request replay parse'}</button>
      </section>}
      <div className="detail-grid">
        <ReviewChart player={player} />
        <section className="panel focus-panel">
          <header className="panel-heading"><div><h2>Next match focus</h2><p>One thing to work on</p></div><span className="metric-icon orange"><Target size={18} /></span></header>
          <p className="focus-copy">{focus}</p>
          <div className="mini-compare">
            <div><span>Last hits at 5:00</span><strong>{fmt(atMinute(player, 5)?.lastHits)}</strong></div>
            <div><span>Last hits at 10:00</span><strong>{fmt(currentTen?.lastHits)}</strong></div>
          </div>
          <div className="baseline">
            <h3>Personal benchmark</h3>
            {currentBaseline.length ? <>
              <p>{currentBaseline.length} comparable {currentBaseline.length === 1 ? 'match' : 'matches'} · Same hero, role, side, and mode</p>
              {([5, 10] as const).map((minute) => {
                const stats = available(currentBaseline.map((entry) => atMinute(entry, minute)?.lastHits))
                return <div className="benchmark-row" key={minute}><span>{minute}:00 average</span><strong>{fmt(average(stats))} LH <small>({stats.length})</small></strong></div>
              })}
            </> : <p>{personalRows.length ? 'Load comparable matches to see your normal pace.' : 'A matching hero, role, side, and mode are needed for comparison.'}</p>}
            {!sample && personalRows.length > 0 && <button className="text-button" disabled={loadingBaseline} onClick={loadBaseline}>{loadingBaseline ? 'Loading comparable matches…' : 'Load comparable matches'} <ArrowRight size={14} /></button>}
            <Feedback message={baselineMessage} />
          </div>
        </section>
      </div>
      {match.timeline && <ObjectiveTimeline timeline={match.timeline} />}
      <section className="panel trend-panel reveal"><header className="panel-heading"><div><h2>Team gold lead</h2><p>Radiant minus Dire, minute by minute: find the moment the game turned</p></div></header><DiffChart players={match.players} /></section>
      <section className="panel events-panel">
        <header className="panel-heading"><div><h2>Replay events</h2><p>Item purchases, vision, objectives, and deaths</p></div><ListFilter size={18} className="quiet-icon" /></header>
        <div className="segment" aria-label="Event type">{eventTabs.map((tab) => <button type="button" key={tab} aria-pressed={eventFilter === tab}
          onClick={() => { setEventFilter(tab); setEventLimit(10) }}>{tab}</button>)}</div>
        {events.length ? <div className="event-list">{events.slice(0, eventLimit).map((event, index) => {
          const comparisons = event.kind === 'item' ? available(currentBaseline.map((entry) =>
            entry.events.find((entry) => entry.kind === 'item' && entry.label === event.label)?.time)) : []
          return <div key={event.label + index} className="event-row">
            <span className="event-time">{clock(event.time)}</span><Flag size={14} /><strong>{event.label}</strong>
            {comparisons.length > 0 && <span className="event-baseline">Avg. {clock(average(comparisons))} · {comparisons.length} {comparisons.length === 1 ? 'match' : 'matches'}</span>}
            <span className={'event-kind ' + event.kind}>{event.kind}</span>
          </div>
        })}{events.length > eventLimit && <button className="text-button" onClick={() => setEventLimit(eventLimit + 10)}>Show more events <ArrowRight size={14} /></button>}</div> :
          <Empty title="No events available for this view" />}
      </section>
    </>}
  </>
}
