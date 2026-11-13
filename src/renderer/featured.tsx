import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Gamepad2, Swords } from 'lucide-react'
import type { AppApi, Catalog, HeroDetail, MatchSummary } from '../shared/model'
import type { HeroGuide } from '../shared/guide'
import { guideTips } from '../shared/guide'
import { percentileOf } from '../shared/coach'
import { featuredHero } from '../shared/analysis'
import { classifyStyle } from '../shared/style'
import { Bars, Donut, FormStrip, Radar, TornEdge } from './charts'
import { fmt, Portrait } from './ui'

const art = (slug: string) => 'https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders/' + slug + '.png'
const ordinal = ['1st', '2nd', '3rd']
const palette = ['#d23c30', '#d9ac4f', '#5a95e0', '#6bbf59', '#b48ce6']

export type Featured = NonNullable<ReturnType<typeof featuredHero>>

/** Loads the signature hero's guide and benchmark detail once for the whole overview. */
export function useFeatured(api: AppApi, catalog: Catalog, matches: MatchSummary[], loadGuide: boolean) {
  const feat = useMemo(() => featuredHero(matches, 30), [matches])
  const [guide, setGuide] = useState<HeroGuide | null>(null)
  const [detail, setDetail] = useState<HeroDetail | null>(null)
  const id = feat?.heroId
  useEffect(() => {
    setDetail(null)
    if (id == null) return
    let on = true
    void api.heroDetail(id, false).then((d) => { if (on) setDetail(d) }).catch(() => {})
    return () => { on = false }
  }, [api, id])
  useEffect(() => {
    setGuide(null)
    if (!loadGuide || id == null) return
    let on = true
    void api.heroGuide(id).then((value) => { if (on) setGuide(value) }).catch(() => {})
    return () => { on = false }
  }, [api, id, loadGuide])
  const hero = catalog.heroes.find((h) => h.id === id)
  const pcts = useMemo(() => {
    const data = detail?.data
    if (!feat || !data || !detail) return null
    const p = (v: number | null, key: 'gpm' | 'xpm' | 'lhpm') => v == null ? null : percentileOf(v, data.bench[key], detail.percentiles)
    return { gpm: p(feat.gpm, 'gpm'), xpm: p(feat.xpm, 'xpm'), lhpm: p(feat.lhpm, 'lhpm') }
  }, [feat, detail])
  return { feat, hero, guide, detail, pcts }
}
type Loaded = ReturnType<typeof useFeatured>

function Stat({ label, value, digits = 0, suffix = '', pct }: { label: string; value: number | null; digits?: number; suffix?: string; pct?: number | null }) {
  return <div className="stage-stat"><small>{label}</small><strong>{value == null ? '—' : fmt(value, digits) + suffix}</strong>
    {pct != null && <div className="meter" title={'Percentile among all players on this hero: ' + Math.round(pct)}><i style={{ width: pct + '%', background: pct >= 66 ? 'var(--good)' : pct >= 33 ? 'var(--gold)' : 'var(--bad)' }} /></div>}
    {pct != null && <em>{Math.round(pct)}th percentile</em>}</div>
}

export function FeaturedStage({ f, catalog, demo, account, localInstall, localBuilds, onAccount, onImport, onUseHero, onOpenGame, onDraft }: {
  f: Loaded; catalog: Catalog; demo: boolean; account: string; localInstall: boolean; localBuilds: number; onAccount: () => void; onImport: () => void; onUseHero: (id: number) => void; onOpenGame: () => void; onDraft: () => void
}) {
  const { feat, hero, guide, pcts } = f
  const [artBroken, setArtBroken] = useState('')
  if (!feat || !hero) return <section className="stage stage-empty"><div className="stage-copy"><small className="stage-eyebrow">PLAYER DASHBOARD</small>
    <h1 className="stage-name">Your Dota workspace</h1>
    <p className="stage-hype">{account ? <>Steam account <b>{account}</b> is linked. {localInstall ? 'The local Dota 2 install and its item builds are ready to use.' : 'Link a local Dota 2 install to use its item builds and live player feed.'} Match history appears when public data is available or you open a completed match by ID.</> : <>Link your Steam account to load public match history. Local Dota item builds and your opt-in player-visible game feed can support planning and practice.</>}</p>
    <div className="local-source-row"><span className={account ? 'source-ready' : ''}>Steam account {account ? 'linked' : 'not linked'}</span><span className={localInstall ? 'source-ready' : ''}>Local Dota {localInstall ? 'found' : 'not found'}</span>{localBuilds > 0 && <span className="source-ready">{localBuilds} local item builds</span>}<span>History from public match data or match ID</span></div>
    <div className="actions"><button className="button primary" onClick={onOpenGame}><Gamepad2 size={16} /> Open Dota 2 via Steam</button>{!account && <button className="button primary" onClick={onAccount}>Add Dota account <ArrowRight size={16} /></button>}<button className="button" onClick={onImport}>Open match by ID</button>{localInstall && <button className="button" onClick={onDraft}>Use local item builds</button>}</div></div><TornEdge /></section>
  const heroName = (id: number) => catalog.heroes.find((h) => h.id === id)?.name ?? 'Hero'
  return <section className="stage">
    <div className="stage-art" aria-hidden="true">
      {artBroken !== hero.slug && <img key={hero.slug} src={hero.slug === 'phantom_assassin' ? import.meta.env.BASE_URL + 'heroes/banner.webp' : art(hero.slug)} alt="" decoding="async" onError={() => setArtBroken(hero.slug)} />}
    </div>
    <div className="stage-copy">
      <div className="stage-rank">01<sup>+</sup></div>
      <small className="stage-eyebrow">YOUR MOST PLAYED · LAST {feat.of} MATCHES{demo ? ' · SAMPLE' : ''}</small>
      <h1 className="stage-name">{hero.name}</h1>
      <p className="stage-hype">{guide?.info?.hype || (hero.roles.join(' · ') + '. Your signature hero lately: here is how it is going.')}</p>
      <div className="stage-stats">
        <Stat label="GAMES" value={feat.games} />
        <Stat label="WIN RATE" value={feat.games ? 100 * feat.wins / feat.games : null} suffix="%" />
        <Stat label="KDA" value={feat.kda} digits={2} />
        <Stat label="GPM" value={feat.gpm} pct={pcts?.gpm} />
        <Stat label="XPM" value={feat.xpm} pct={pcts?.xpm} />
        <Stat label="LAST HITS / MIN" value={feat.lhpm} digits={1} pct={pcts?.lhpm} />
      </div>
      <div className="actions">
        <button className="button primary" onClick={() => onUseHero(hero.id)}><Swords size={16} /> Plan a draft with {hero.name}</button>
        <button className="button" onClick={onOpenGame}><Gamepad2 size={16} /> Open Dota 2 via Steam</button>
        {!account && <button className="button" onClick={onAccount}>Add Dota account</button>}
        <button className="button" onClick={onImport}>Open match by ID</button>
      </div>
      {feat.others.length > 0 && <ol className="stage-others">{feat.others.map((o, i) => <li key={o.heroId}><b>{ordinal[i + 1]}</b><Portrait hero={catalog.heroes.find((h) => h.id === o.heroId)} />{heroName(o.heroId)}<em>{o.games} games · {fmt(o.winRate, 0)}%</em></li>)}</ol>}
    </div>
    <TornEdge />
  </section>
}

const attrs = (g: HeroGuide) => g.info ? [
  ['Attack range', g.info.attackRange], ['Move speed', g.info.moveSpeed], ['Armor', g.info.armor], ['Magic resist', g.info.magicResist + '%'],
  ['Health', g.info.health], ['Mana', g.info.mana], ['Damage', g.info.damage[0] + '–' + g.info.damage[1]], ['Vision', g.info.sightDay + ' / ' + g.info.sightNight],
] as [string, string | number][] : []

/** Light "paper" guide sections in the style of a hero poster: skills, attributes, matchups, pro tips, patch history. */
export function GuideSections({ f, catalog }: { f: Loaded; catalog: Catalog }) {
  const { hero, guide, detail } = f
  if (!hero) return null
  const name = (id: number) => catalog.heroes.find((h) => h.id === id)?.name ?? 'Hero'
  const tips = guide ? guideTips(guide, detail?.data ?? undefined, undefined, (k) => catalog.items[k] ?? k) : []
  const none = <p className="paper-note">Open the desktop app to load Valve and OpenDota guide data for this hero.</p>
  return <section className="paper" aria-label={hero.name + ' guide'}>
    <div className="paper-grid">
      <article className="paper-card reveal" style={{ ['--i' as string]: 0 }}>
        <h2 className="serif">Skill</h2><span className="red-tag">SPELLS</span>
        {guide?.info?.abilities.length ? <ul className="spells">{guide.info.abilities.map((a) => <li key={a.name}><b>{a.name}</b><p>{a.desc.length > 150 ? a.desc.slice(0, 147) + '…' : a.desc}</p>
          {(a.cooldown || a.mana) && <small>{a.cooldown && 'Cooldown ' + a.cooldown}{a.cooldown && a.mana && ' · '}{a.mana && 'Mana ' + a.mana}</small>}</li>)}</ul> : none}
      </article>
      <article className="paper-card red reveal" style={{ ['--i' as string]: 1 }}>
        <h2 className="serif">Attributes</h2><span className="red-tag light">{guide?.info ? guide.info.primary.toUpperCase() : 'VALVE DATA'}</span>
        {guide?.info ? <><dl className="attrs">{attrs(guide).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          <p className="pips" aria-label={'Complexity ' + guide.info.complexity + ' of 3'}>Complexity {[1, 2, 3].map((n) => <i key={n} className={n <= guide.info!.complexity ? 'on' : ''} />)}</p></> : <p className="paper-note light">Base stats appear when guide data loads.</p>}
      </article>
      <article className="paper-card reveal" style={{ ['--i' as string]: 2 }}>
        <h2 className="serif">Collocation</h2><span className="red-tag">MATCHUPS</span>
        {detail && (detail.strongAgainst.length || detail.weakAgainst.length) ? <div className="matchups">
          <div><h3>Strong against</h3>{detail.strongAgainst.slice(0, 4).map((r) => <p key={r.heroId}><Portrait hero={catalog.heroes.find((h) => h.id === r.heroId)} />{name(r.heroId)}<b className="pos">{fmt(r.rate, 1)}%</b></p>)}</div>
          <div><h3>Weak against</h3>{detail.weakAgainst.slice(0, 4).map((r) => <p key={r.heroId}><Portrait hero={catalog.heroes.find((h) => h.id === r.heroId)} />{name(r.heroId)}<b className="neg">{fmt(r.rate, 1)}%</b></p>)}</div>
        </div> : none}
      </article>
      <article className="paper-card reveal" style={{ ['--i' as string]: 3 }}>
        <h2 className="serif">Guide</h2><span className="red-tag">PLAYER TIPS</span>
        {tips.length ? <ol className="tips-list">{tips.slice(0, 6).map((t) => <li key={t}>{t}</li>)}</ol> : none}
      </article>
      <article className="paper-card wide reveal" style={{ ['--i' as string]: 4 }}>
        <h2 className="serif">Historic version</h2><span className="red-tag">RECENT PATCHES</span>
        {guide?.patches.length ? <div className="history">{guide.patches.slice(0, 4).map((p) => <div key={p.patch}><b>{p.patch}</b><small>{new Date(p.at * 1000).toLocaleDateString()}</small>
          <ul>{p.notes.slice(0, 3).map((n) => <li key={n}>{n}</li>)}</ul></div>)}</div> : <p className="paper-note">{guide ? 'No balance changes to this hero in the last few patches.' : 'Patch history loads from Valve\'s patch notes.'}</p>}
      </article>
    </div>
  </section>
}

/** Graph row: recent form, hero pool, skill radar vs hero benchmarks, GPM per match. */
/** Playstyle learned from your last 40 matches: archetype scores, traits and tailored advice. */
export function StyleCard({ matches, catalog }: { matches: MatchSummary[]; catalog: Catalog }) {
  const style = useMemo(() => classifyStyle(matches, catalog.heroes), [matches, catalog])
  if (!style) return <section className="panel insight style-card reveal"><header className="panel-heading"><div><h2>Your playstyle</h2><p>Needs 5+ recent matches with stats</p></div></header></section>
  return <section className="panel insight style-card reveal" style={{ ['--i' as string]: 4 }}>
    <header className="panel-heading"><div><h2>Your playstyle</h2><p>Learned from your last {style.metrics.games} matches</p></div></header>
    <div className="style-head"><b className="serif">{style.primary.name}</b>{style.secondary && <small>with {style.secondary.name.toLowerCase()} traits</small>}</div>
    <p className="fine-print">{style.primary.desc}</p>
    <Radar axes={style.archetypes.map((a) => ({ label: a.name.replace('Frontline ', '').replace('Dynamic ', 'Dyn. ').replace('Utility ', 'Util. '), value: a.score }))} />
    <div className="style-side"><div className="stat-bars">{style.traits.map((t) => <div className="stat-bar" key={t.name} title={t.desc}><span>{t.name}</span><div className="meter single"><i style={{ width: t.score + '%' }} /></div><b>{t.score}</b></div>)}</div>
    <ul className="style-advice">{style.advice.map((a) => <li key={a}>{a}</li>)}</ul></div>
  </section>
}

export function Insights({ f, catalog, matches, showStyle = true }: { f: Loaded; catalog: Catalog; matches: MatchSummary[]; showStyle?: boolean }) {
  const { feat, pcts, detail } = f
  const recent = matches.slice(0, 30)
  const pool = useMemo(() => {
    const counts = new Map<number, number>()
    for (const m of recent) counts.set(m.heroId, (counts.get(m.heroId) ?? 0) + 1)
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])
    const slices = top.slice(0, 4).map(([id, value], i) => ({ label: catalog.heroes.find((h) => h.id === id)?.name ?? 'Hero', value, color: palette[i] }))
    const rest = top.slice(4).reduce((s, [, v]) => s + v, 0)
    return rest ? [...slices, { label: 'Others', value: rest, color: '#5d6470' }] : slices
  }, [recent, catalog])
  const wins = recent.filter((m) => m.won).length
  const axes = feat ? [
    { label: 'GPM', value: pcts?.gpm }, { label: 'XPM', value: pcts?.xpm }, { label: 'LH/min', value: pcts?.lhpm },
    { label: 'Win rate', value: feat.games ? Math.min(100, 100 * feat.wins / feat.games) : null },
    { label: 'KDA', value: feat.kda == null ? null : Math.min(100, feat.kda / 6 * 100) },
  ].flatMap((a) => a.value == null ? [] : [{ label: a.label, value: a.value }]) : []
  const median = detail?.data?.bench.gpm[2] ?? null
  return <div className="insight-grid">
    <section className="panel insight reveal" style={{ ['--i' as string]: 0 }}><header className="panel-heading"><div><h2>Recent form</h2><p>{wins}W · {recent.length - wins}L in your last {recent.length}</p></div></header><FormStrip matches={recent} /></section>
    <section className="panel insight reveal" style={{ ['--i' as string]: 1 }}><header className="panel-heading"><div><h2>Hero pool</h2><p>Games per hero, last {recent.length}</p></div></header>
      <Donut slices={pool} center={String(pool.length ? new Set(recent.map((m) => m.heroId)).size : 0)} sub="heroes" /></section>
    <section className="panel insight reveal" style={{ ['--i' as string]: 2 }}><header className="panel-heading"><div><h2>Skill profile</h2><p>{feat ? 'On your signature hero, vs all players' : 'Needs match data'}</p></div></header><Radar axes={axes} />
      {!pcts && feat && <p className="fine-print">Percentile axes appear when hero benchmarks are available.</p>}</section>
    <section className="panel insight reveal" style={{ ['--i' as string]: 3 }}><header className="panel-heading"><div><h2>GPM per match</h2><p>Green = above the hero median</p></div></header>
      <Bars data={recent.slice(0, 15).toReversed().map((m) => ({ label: m.won ? 'Win' : 'Loss', value: m.gpm, good: median == null || m.gpm == null ? undefined : m.gpm >= median }))} reference={median} /></section>
    {showStyle && <StyleCard matches={matches} catalog={catalog} />}
  </div>
}
