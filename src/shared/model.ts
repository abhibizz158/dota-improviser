import type { PersonalPerformance } from './personal-performance.js'
import type { Suggestion } from './brain.js'
import type { CoachView, HeroData } from './coach.js'
import type { HeroGuide, Support } from './guide.js'
import type { GameEvent, GameTrack } from './game.js'
import type { CorpusDoc } from './corpus.js'
import type { RoshanState } from './roshan.js'
import type { FeatureName, Fix, Kit, TeamProfile } from './mechanics.js'
import type { AwardRecord, Recovery, RoleChoice } from './live-coach.js'

export type Role = 'Carry' | 'Mid' | 'Offlane' | 'Soft support' | 'Hard support'
export const roles: Role[] = ['Carry', 'Mid', 'Offlane', 'Soft support', 'Hard support']
export const roleLabels: Record<Role, string> = { Carry: 'Safelane', Mid: 'Mid', Offlane: 'Offlane', 'Soft support': 'Support', 'Hard support': 'Hard support' }
export type Hero = { id: number; slug: string; name: string; roles: string[]; ranged?: boolean }
export type MatchSummary = {
  id: string; heroId: number; start: number; duration: number; won: boolean | null; side: 'Radiant' | 'Dire';
  kills: number | null; deaths: number | null; assists: number | null; lastHits: number | null; denies: number | null;
  gpm: number | null; xpm: number | null; mode: string; patch: string; role: Role | null; source?: 'local'
  /** Only set by local (own-feed) recording: 'completed' once a team's ancient fell, 'abandoned' if the game or app ended first. Absent for remote (OpenDota) rows, which are always completed matches. */
  status?: 'completed' | 'abandoned'
}
export const gameTypes = ['Ranked', 'Normal', 'Turbo', 'Ability Draft', 'Other'] as const
export type GameType = typeof gameTypes[number]
/** One own-feed game, recorded locally when it ends. 'abandoned' means the app or the game closed, or you left, before a team's ancient fell. */
export type SessionRecord = {
  at: number; hero: string; heroId: number | null; clock: number; kills: number | null; deaths: number | null; assists: number | null
  lastHits: number | null; gpm: number | null; xpm: number | null; best: string | null; firstBlood: GameTrack['firstBlood']
  status: 'completed' | 'abandoned'; gameType: GameType | null; lane: Role | null
}
export type Minute = { time: number; gold: number | null; xp: number | null; lastHits: number | null; deaths: number | null }
export type ReviewEvent = { time: number | null; label: string; kind: 'item' | 'vision' | 'objective' | 'death'; key?: string }
export type MatchPlayer = MatchSummary & {
  slot: number; accountId: string | null; minutes: Minute[]; events: ReviewEvent[]; purchasesAvailable?: boolean
}
export type Tower = { team: 'Radiant' | 'Dire'; tier: number; lane: 'Top' | 'Mid' | 'Bot' | 'Base'; time: number }
export type Timeline = {
  towers: Tower[]; barracks: { team: 'Radiant' | 'Dire'; lane: string; kind: 'Melee' | 'Ranged'; time: number }[]
  roshan: number[]; firstBlood: number | null; goldAdv: number[]; xpAdv: number[]
}
export type MatchReview = { id: string; players: MatchPlayer[]; parsed: boolean; start: number; duration: number; patch: string; timeline?: Timeline; localOnly?: boolean }
export type SourceResult<T> = { data: T; updatedAt: number; stale: boolean }
export type Matchup = { heroId: number; games: number; wins: number }
export type Matchups = Record<number, Matchup[]>
export type Build = Record<'starting' | 'early' | 'mid' | 'late', { item: string; count: number }[]>
export type ItemUpgrade = { name: string; text: string }
export type Catalog = { heroes: Hero[]; items: Record<string, string>; patch: string; patches: string[]; upgrades?: Record<number, { scepter?: ItemUpgrade; shard?: ItemUpgrade }> }
export type DataStatus = { state: 'idle' | 'updating' | 'ready' | 'error'; done: number; total: number; updatedAt: number; message: string }
export const placements = ['Auto', 'Top left', 'Top right', 'Bottom left', 'Bottom right'] as const
export type Placement = typeof placements[number]
export type DisplayChoice = { id: string; name: string }
export const featureKeys = ['winMeter', 'bans', 'laneWatch', 'coachTips', 'achievements', 'personal', 'performanceMeter', 'hints', 'toasts', 'achievementSound', 'overlayAssistant', 'deathAdvice', 'momentum', 'multikills', 'phaseAdaptive', 'adaptiveRole', 'styleProfile', 'roshanTimer', 'autoOpen', 'autoUpdate', 'autoInstallApp', 'learning', 'patchAware', 'draftVision'] as const
export type FeatureKey = typeof featureKeys[number]
export type Features = Record<FeatureKey, boolean>
export const defaultFeatures = Object.fromEntries(featureKeys.map((k) => [k, k !== 'achievementSound' && k !== 'draftVision'])) as Features
export const featureInfo: Record<FeatureKey, { group: 'Overlay modules' | 'Intelligence' | 'Automation'; label: string; help: string }> = {
  winMeter: { group: 'Overlay modules', label: 'Lineup win meter', help: 'Estimated edge of your lineup vs theirs while drafting.' },
  roshanTimer: { group: 'Overlay modules', label: 'Roshan / Aegis timer', help: 'A stopwatch you start yourself (hotkey or button) when Roshan dies. Reads nothing from the game.' },
  bans: { group: 'Overlay modules', label: 'Show bans', help: 'Banned heroes row in the draft overlay.' },
  laneWatch: { group: 'Overlay modules', label: 'Lane watch', help: 'Your win rate vs each revealed enemy, plus lineup advice.' },
  coachTips: { group: 'Overlay modules', label: 'Coach tips', help: 'Live tips: farm, unspent gold, deaths.' },
  achievements: { group: 'Overlay modules', label: 'Track practice achievements', help: 'Record hero and role item milestones and timed goals.' },
  performanceMeter: { group: 'Overlay modules', label: 'Personal performance meter', help: 'Compare your pace with previous matches every five minutes.' },
  personal: { group: 'Overlay modules', label: 'Your own average', help: 'Compare with your average on this hero.' },
  hints: { group: 'Overlay modules', label: 'Hotkey hints', help: 'Footer line with shortcuts.' },
  toasts: { group: 'Overlay modules', label: 'Achievement pop-ups', help: 'Animated banners for first blood, multi-kills, streaks and goals.' },
  achievementSound: { group: 'Overlay modules', label: 'Dota achievement sound', help: 'Play a Valve chat-wheel sound when an achievement is awarded.' },
  overlayAssistant: { group: 'Overlay modules', label: 'Puter overlay assistant', help: 'Ask about your draft or practice game with Ctrl/⌘ + Shift + O once a game is live.' },
  deathAdvice: { group: 'Overlay modules', label: 'Respawn coach', help: 'Show a next step based on your role, build and practice stats while dead.' },
  momentum: { group: 'Overlay modules', label: 'Momentum graph', help: 'Kill lead of your team over the game, like Dota\'s own advantage graph.' },
  multikills: { group: 'Intelligence', label: 'Kill tracking', help: 'Detect first blood, double/triple/ultra kill, rampage and streaks from your own feed.' },
  phaseAdaptive: { group: 'Automation', label: 'Adapt overlay to game phase', help: 'Laning and mid game show full detail; late game trims to essentials.' },
  adaptiveRole: { group: 'Intelligence', label: 'Estimate my role automatically', help: 'Use your hero, match history and known lineup. Match and hero overrides take priority.' },
  styleProfile: { group: 'Intelligence', label: 'Playstyle profile', help: 'Classify your style (carry, dynamic support, endurance...) from your matches.' },
  autoOpen: { group: 'Automation', label: 'Open draft overlay at pick phase', help: 'Show the draft card when hero selection starts.' },
  autoUpdate: { group: 'Automation', label: 'Update data after patches', help: 'Refetch public hero data in the background after a Dota update.' },
  autoInstallApp: { group: 'Automation', label: 'Launch verified updates automatically', help: 'Once a GitHub release is downloaded and verified, launch its installer as soon as you are not mid-game, instead of waiting for you to click Install in Settings. You still click through the installer itself (and enter your password on macOS) — this app never launches other programs silently or in the background; that is a deliberate fair-play guardrail, not a missing feature.' },
  learning: { group: 'Intelligence', label: 'Learn from my matches', help: 'Use your history to adjust suggestions. Off = public data only.' },
  patchAware: { group: 'Intelligence', label: 'Patch awareness', help: 'Trust old data less for heroes changed in recent patches.' },
  draftVision: { group: 'Intelligence', label: 'Draft vision', help: 'Match visible hero portraits during hero selection and strategy time. On Mac, allow Screen Recording for the app. On Windows, use Borderless Windowed or Windowed mode.' },
}
export type LiveSettings = {
  display: 'Overlay' | 'Companion'; size: 'Compact' | 'Large'; placement: Placement; monitor: string;
  role: Role; heroRoles: Record<number, Role>; cues: boolean; coach: boolean; opacity: number; detailed: boolean; saveOwnMatches: boolean; features: Features
}
export const defaultLiveSettings: LiveSettings = {
  display: 'Overlay', size: 'Compact', placement: 'Auto', monitor: 'auto', role: 'Carry', heroRoles: {}, cues: false, coach: false, opacity: 0.94, detailed: true, saveOwnMatches: false, features: defaultFeatures,
}
export type Lane = {
  clock: number; heroSlug: string | null; lastHits: number | null; denies: number | null;
  deaths: number | null; level: number | null; paused: boolean
}
export type Checkpoint = { minute: 5 | 10; lastHits: number }
export type Pace = Checkpoint & { matches: number }
export type DraftInput = Partial<{ enemy: number[]; allied: number[]; pool: number[]; ownHero: number | null; role: Role | null }>
export type DraftView = {
  enemy: number[]; allied: number[]; pool: number[]; role: Role; suggestions: Suggestion[]
  ownHero: number | null; lockedHero: number | null; revealedEnemy: number[]; revealedAllied: number[]; roleChoice: RoleChoice
  bans: number[]; timeLeft: number | null; activeTeam: 'Radiant' | 'Dire' | null; teamWin: number | null
  model: { samples: number; comfortWeight: number }; patched: number[]; avoid: Suggestion[]; analysis: Analysis
  stale: boolean; seedPatch: string; build: number | null; patchChanged: boolean; loading: boolean; personal: number
  /** Your own locked hero's matchups, so there's still something useful on screen once enemy/ally picks can't be read. */
  ownMatchups: { strongAgainst: { heroId: number; rate: number }[]; weakAgainst: { heroId: number; rate: number }[] } | null
}
export const emptyDraft: DraftView = {
  enemy: [], allied: [], pool: [], role: 'Carry', bans: [], timeLeft: null, activeTeam: null, teamWin: null, model: { samples: 0, comfortWeight: 0.5 }, patched: [], avoid: [], analysis: { enemy: null, ally: null, fixes: [], model: null }, suggestions: [], stale: true, seedPatch: '', build: null,
  patchChanged: false, loading: false, personal: 0, ownMatchups: null,
  ownHero: null, lockedHero: null, revealedEnemy: [], revealedAllied: [], roleChoice: { role: 'Carry', source: 'Default', override: null },
}
export type LocalStatus = { installFound: boolean; gsiInstalled: boolean; steamFound: boolean; build: number | null; localBuilds: number }
export type PuterStatus = { connected: boolean; saved: boolean; model: string }
export type KnowledgeContext = {
  heroId?: number; enemyIds?: number[]; itemKeys?: string[]; clockSeconds?: number; gpm?: number; gold?: number
  xpm?: number; kills?: number; deaths?: number; assists?: number; lastHits?: number; denies?: number; level?: number
  killStreak?: number; alive?: boolean; teamScore?: number; enemyScore?: number
}
export type UpdateInfo = { current: string; latest: string | null; state: 'idle' | 'checking' | 'downloading' | 'ready' | 'current' | 'error'; message: string }
export type Frame = {
  matchId?: string; clock: number; heroSlug: string; heroId: number | null; level: number | null; alive: boolean; gold: number | null
  gpm: number | null; xpm: number | null; lastHits: number | null; denies: number | null; kills: number | null
  deaths: number | null; assists: number | null; items: string[]; itemsObserved: boolean; respawnSeconds: number | null; paused: boolean; matchmaking: boolean
  team: 'Radiant' | 'Dire'; radiantScore: number | null; direScore: number | null; killStreak: number | null
}
export type DraftReveal = { radiant: { picks: number[]; bans: number[] }; dire: { picks: number[]; bans: number[] }; activeTeam: 'Radiant' | 'Dire' | null; timeLeft: number | null }
export type Pick = { team: 'Radiant' | 'Dire'; heroId: number | null }
export type GameView = {
  team: 'Radiant' | 'Dire'; firstBlood: GameTrack['firstBlood']; lead: number | null; momentum: [number, number][]
  multi: Record<string, number>; best: string | null; streak: number; kills: number | null
}
export type Toast = GameEvent & { shownAt: number }
export type OverlayView = 'lane' | 'draft' | 'assistant' | 'setup'
export type LiveState = {
  view: OverlayView; interactive: boolean; draft: DraftView; pick: Pick | null; coach: CoachView | null; data: DataStatus; support: Support | null; game: GameView | null; toasts: Toast[]; career: Record<string, number>;
  status: 'Idle' | 'Waiting for Dota' | 'Pick phase' | 'Live' | 'Paused' | 'Feed stale' | 'Unsupported session' | 'Connection error';
  recovery: Recovery | null; awards: Record<string, AwardRecord>; assistantShortcutAvailable: boolean;
  lane: Lane | null; receivedAt: number | null; open: boolean; armed: boolean;
  pace: Pace[]; checkpoints: Checkpoint[]; settings: LiveSettings; shortcutAvailable: boolean; roshan: RoshanState
  displays?: DisplayChoice[]; overlayDisplay?: { name: string; following: boolean }
  /** False when the OS-level window-detection module failed to load (e.g. not built for this platform/arch) — "Follow Dota" can't work and the UI should say so. */
  detectionAvailable: boolean
  historyChangedAt?: number
  /** True once a game is live but you haven't said this session's lane/role and game type yet — the overlay should prompt. */
  performance?: PersonalPerformance;
  needsSessionInfo: boolean; sessionInfo: { gameType: GameType | null; lane: Role | null }
}
export type MechRow = { heroId: number; edge: number; parts: { label: FeatureName; points: number }[] }
export type MechSummary = { r2: number; samples: number; k?: number; importance: { name: FeatureName; weight: number; share: number }[] }
export type Analysis = { enemy: TeamProfile | null; ally: TeamProfile | null; fixes: Fix[]; model: MechSummary | null }
export type HeroDetail = {
  id: number; data: HeroData | null; patch: string; percentiles: number[]; base?: number | null
  strongAgainst: { heroId: number; rate: number; games: number; edge?: number }[]; weakAgainst: { heroId: number; rate: number; games: number; edge?: number }[]
  kit?: Kit | null; mechStrong?: MechRow[]; mechWeak?: MechRow[]; model?: MechSummary | null
}
export type Bootstrap = {
  accountId: string; catalog: Catalog; live: LiveState; cachedHistory?: SourceResult<MatchSummary[]>;
  displays: DisplayChoice[]; desktop: boolean; local: LocalStatus
}
export type ParseProgress = { jobId: string; pending: boolean }
export interface AppApi {
  bootstrap(): Promise<Bootstrap>;
  saveAccount(id: string): Promise<string>;
  history(id: string, refresh?: boolean): Promise<SourceResult<MatchSummary[]>>;
  match(id: string, refresh?: boolean): Promise<SourceResult<MatchReview>>;
  requestParse(id: string): Promise<ParseProgress>;
  parseStatus(id: string): Promise<ParseProgress>;
  matchups(heroIds: number[]): Promise<SourceResult<Matchups>>;
  build(heroId: number): Promise<SourceResult<Build>>;
  clearData(): Promise<Bootstrap>;
  liveSettings(settings: LiveSettings): Promise<LiveState>;
  practice(enabled: boolean): Promise<LiveState>;
  toggleOverlay(): Promise<LiveState>;
  saveConfig(): Promise<boolean>;
  exportDiagnostics(): Promise<boolean>;
  openExternal(target: 'guides' | 'patches' | 'privacy' | 'gsi' | 'personal' | 'releases' | 'screenRecording'): Promise<void>;
  updateData(): Promise<LiveState>;
  heroGuide(id: number): Promise<HeroGuide>;
  itemLearn(heroId: number, sync?: boolean): Promise<import('./items.js').ItemLearning>;
  buildPlan(heroId: number, order?: string[]): Promise<string[]>;
  heroDetail(id: number, full?: boolean): Promise<HeroDetail>;
  draft(input: DraftInput): Promise<LiveState>;
  nudge(mine: number, enemy: number, delta: number): Promise<LiveState>;
  defaultBuild(slug: string): Promise<Partial<Record<'starting' | 'early' | 'mid' | 'late', string[]>> | null>;
  visionDebug(): Promise<{ barWidth: number; barHeight: number; barPng: string; radiant: (number | null)[]; dire: (number | null)[]; radiantNames: (string | null)[]; direNames: (string | null)[] }>;
  detectSteam(): Promise<string | null>;
  openGame(): Promise<void>;
  importHistory(value: string): Promise<SourceResult<MatchSummary[]>>;
  cachedHistory(): Promise<SourceResult<MatchSummary[]> | undefined>;
  sessionHistory(): Promise<SessionRecord[]>;
  parsingMatches(): Promise<string[]>;
  puterStatus(): Promise<PuterStatus>;
  puterSignIn(): Promise<PuterStatus>;
  puterSignOut(): Promise<PuterStatus>;
  puterSetModel(model: string): Promise<PuterStatus>;
  puterAsk(question: string, context?: KnowledgeContext): Promise<string>;
  searchKnowledge(query: string): Promise<CorpusDoc[]>;
  roshanStart(which: 'both' | 'rosh' | 'aegis'): Promise<LiveState>;
  roshanClear(which: 'both' | 'aegis'): Promise<LiveState>;
  installConfig(): Promise<string>;
  toggleDraftOverlay(): Promise<LiveState>;
  toggleAssistant(): Promise<LiveState>;
  askLiveCoach(question: string): Promise<string>;
  onAchievementSound(callback: () => void): () => void;
  checkUpdates(): Promise<UpdateInfo>;
  updateStatus(): Promise<UpdateInfo>;
  installUpdate(): Promise<void>;
  onUpdate(callback: (status: UpdateInfo) => void): () => void;
  onLive(callback: (state: LiveState) => void): () => void;
}
