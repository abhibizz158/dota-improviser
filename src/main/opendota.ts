import type { Build, MatchPlayer, MatchReview, MatchSummary, Matchups, ParseProgress, SourceResult } from '../shared/model.js'
import { comparable, practicePace } from '../shared/analysis.js'
import { asRecord, normalizeBuild, normalizeHistory, normalizeMatch, normalizeMatchups } from './data.js'
import { Store } from './store.js'
import { hostAllowed } from '../shared/guard.js'

const base = 'https://api.opendota.com/api'
const hour = 3600000
const historyFields = ['hero_id', 'start_time', 'kills', 'deaths', 'assists', 'lane_role', 'is_roaming', 'position',
  'last_hits', 'denies', 'gold_per_min', 'xp_per_min', 'patch', 'position_est']
const historyQuery = new URLSearchParams([['limit', '100'], ...historyFields.map((field) => ['project', field])])

export class OpenDota {
  private pending = new Map<string, Promise<SourceResult<unknown>>>()
  private retryAt = 0
  private generation = 0
  private parseRequests = new Map<string, Promise<ParseProgress>>()
  private requestCount = 0
  private waiters: (() => void)[] = []

  constructor(private store: Store) {}

  private async request(path: string, method = 'GET') {
    const generation = this.generation
    if (this.requestCount >= 3) await new Promise<void>((resolve) => this.waiters.push(resolve))
    else this.requestCount++
    try {
      if (generation !== this.generation) throw new Error('Local data was cleared.')
      if (Date.now() < this.retryAt) throw new Error('OpenDota is rate limiting requests. Try again in a minute.')
      if (!hostAllowed(base + path)) throw new Error('Blocked by network allowlist.')
      let response: Response
      try {
        response = await fetch(base + path, { method, signal: AbortSignal.timeout(12000), redirect: 'error' })
      } catch {
        throw new Error('Could not reach OpenDota. Check your connection and try again.')
      }
      if (response.status === 429) {
        const header = response.headers.get('retry-after')
        const retry = header && /^\d+$/.test(header) ? Date.now() + Number(header) * 1000 : Date.parse(header ?? '')
        this.retryAt = Number.isFinite(retry) && retry > Date.now() ? retry : Date.now() + 60000
        throw new Error('OpenDota is rate limiting requests. Try again in a minute.')
      }
      if (response.status === 404) throw new Error('OpenDota could not find this data.')
      if (response.status === 400 && method === 'POST') throw new Error('OpenDota cannot queue a replay for this match.')
      if (!response.ok) throw new Error('OpenDota is temporarily unavailable. Try again shortly.')
      return await response.json() as unknown
    } finally {
      const next = this.waiters.shift()
      if (next) next()
      else this.requestCount--
    }
  }

  private load<T>(path: string, ttl: number, normalize: (raw: unknown) => T, refresh = false): Promise<SourceResult<T>> {
    const saved = this.store.cached<T>(path)
    if (!refresh && saved && Date.now() - saved.updatedAt < ttl) return Promise.resolve(saved)
    const inflight = this.pending.get(path)
    if (inflight) return inflight as Promise<SourceResult<T>>
    const generation = this.generation
    const request = this.request(path).then((value) => {
      const data = normalize(value)
      if (generation !== this.generation) throw new Error('Local data was cleared.')
      return this.store.put(path, data)
    }).catch((error: unknown) => {
      if (saved && generation === this.generation) return { ...saved, stale: true }
      throw error
    }).finally(() => { if (this.pending.get(path) === request) this.pending.delete(path) })
    this.pending.set(path, request)
    return request
  }

  async history(id: string, refresh = false) {
    const result = await this.load('/players/' + id + '/matches?' + historyQuery, hour / 2, normalizeHistory, refresh)
    return { ...result, data: result.data.map((row) => {
      const review = this.cachedMatch(row.id)?.players.find((player) => player.accountId === id)
      return review?.role ? { ...row, role: review.role } : row
    }) }
  }

  historySnapshot(id: string) {
    const cached = this.store.cached<MatchSummary[]>('/players/' + id + '/matches?' + historyQuery)
    return cached && { ...cached, stale: Date.now() - cached.updatedAt >= hour / 2 }
  }

  cachedHistory(id: string) {
    return this.historySnapshot(id)?.data ?? []
  }

  match(id: string, refresh = false) {
    return this.load('/matches/' + id, hour / 2, normalizeMatch, refresh)
  }

  private cachedMatch(id: string) {
    return this.store.cached<MatchReview>('/matches/' + id)?.data
  }

  async matchups(ids: number[]): Promise<SourceResult<Matchups>> {
    if (!ids.length) return { data: {}, updatedAt: 0, stale: false }
    const result = await Promise.all(ids.map((id) => this.load('/heroes/' + id + '/matchups', 24 * hour, normalizeMatchups)))
    return {
      data: Object.fromEntries(ids.map((id, index) => [id, result[index].data])),
      updatedAt: Math.min(...result.map((response) => response.updatedAt)), stale: result.some((response) => response.stale),
    }
  }

  cachedBuild(id: number) {
    return this.store.cached<Build>('/heroes/' + id + '/itemPopularity')
  }

  build(id: number) {
    return this.load('/heroes/' + id + '/itemPopularity', 24 * hour, normalizeBuild)
  }

  /** Drop cached hero matchups so the next draft pulls post-patch aggregates. */
  invalidateMatchups() {
    this.store.invalidatePrefix('/heroes/')
    for (const key of this.pending.keys()) if (key.startsWith('/heroes/')) this.pending.delete(key)
  }

  requestParse(id: string) {
    const current = this.store.get<string>('parse:' + id)
    if (current) return Promise.resolve({ jobId: current, pending: true })
    const active = this.parseRequests.get(id)
    if (active) return active
    const generation = this.generation
    const request = this.request('/request/' + id, 'POST').then((response) => {
      if (generation !== this.generation) throw new Error('Local data was cleared.')
      const job = asRecord(asRecord(response).job)
      const jobId = String(job.jobId ?? job.id ?? '')
      if (!/^\d+$/.test(jobId)) throw new Error('OpenDota could not queue this replay.')
      this.store.set('parse:' + id, jobId)
      return { jobId, pending: true }
    }).finally(() => { if (this.parseRequests.get(id) === request) this.parseRequests.delete(id) })
    this.parseRequests.set(id, request)
    return request
  }

  async parseStatus(id: string): Promise<ParseProgress> {
    const jobId = this.store.get<string>('parse:' + id) ?? ''
    if (!jobId) return { jobId, pending: false }
    const response = await this.request('/request/' + jobId)
    const pending = response != null && Object.keys(asRecord(response)).length > 0
    if (!pending && this.store.get('parse:' + id) === jobId) {
      this.store.set('parse:' + id, '')
      this.store.invalidate('/matches/' + id)
    }
    return { jobId, pending }
  }

  pace(account: string, heroId: number, role: MatchPlayer['role']) {
    const matches = this.store.savedReviews().flatMap((review) => review.players.filter((player) =>
      player.accountId === account && player.heroId === heroId && player.role === role &&
      player.mode.endsWith('All Pick') && player.minutes.length > 0)).sort((a, b) => b.start - a.start)
    const reference = matches[0]
    return reference ? practicePace([reference, ...matches.filter((match) => comparable(reference, match))]) : []
  }

  clear() {
    this.generation++
    this.pending.clear()
    this.parseRequests.clear()
    this.store.clear()
  }
}
