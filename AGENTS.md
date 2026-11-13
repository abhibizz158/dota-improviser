# Dota Improviser: agents and flow

Stats-only companion. **No** memory reading, screen scraping, input injection, packet sniffing, or hidden-info extraction. Gameplay inputs: Valve GSI (player-visible, opt-in cfg), public OpenDota aggregates, local read-only files (`steam.inf`, `itembuilds/`, Steam `loginusers.vdf`), and picks the user types. For overlay placement only, the main process may use the OS-reported foreground Dota window bounds.

## Project agents (`.claude/agents/`)
| Agent | Owns | Files |
|---|---|---|
| `data-sync` | Seed, OpenDota cache, patch detection, local Dota/Steam discovery | `scripts/build-seed.mjs`, `src/main/{opendota,local,store}.ts`, `data/seed.json` |
| `draft-brain` | Counter scoring, personal learning, manual nudges | `src/shared/brain.ts`, `src/renderer/draft.tsx` |
| `overlay-engineer` | Overlay window, fullscreen behaviour on macOS/Windows, hotkeys, perf | `src/main/index.ts` (overlay), `DraftCard`/`LaneCard` in `src/renderer/ui.tsx` |
| `safety-guard` | Vetoes anything that reads game memory/screen or leaks hidden info; reviews every PR | whole repo |
| `qa` | Tests, packaging, per-platform checklist | `tests/`, `package.json` |

## Runtime "agents" (modules in the main process)
- **patch watcher** (`watchPatch`, every 10 min + startup): compares Dota `steam.inf` build to last seen. New build -> drop cached matchups, mark bundled seed stale, UI banner.
- **learner** (`learnProfile`): rebuilt from saved history/reviews on demand (idempotent, 120-day half-life). No separate training step; opening more matches = smarter.
- **draft engine** (`suggest`): seed + live + you + manual nudges, shrunk toward 50% on small samples.

## Data
- App data (downloaded hero/matchup data, local SQLite history, encrypted Puter/GSI tokens) lives in a hidden folder under the user's own Documents — `~/Documents/.dota-improviser` on macOS and Windows alike (`app.setPath('userData', ...)` in `src/main/index.ts`, set before anything touches `app.getPath('userData')`), not the OS default (Application Support / AppData\Roaming). Fixed by that path, not the app version, so an app update never re-triggers a download of data already on disk.
- `npm run data` = matchup seed + hero database + Valve kits + item-timing dataset. Written to `data/` for **dev use only** (`npm run dev`/`npm run build`'s browser-preview fallback reads these); the packager's `--ignore` excludes `data` from every `package:*` script, so a real install ships with none of it. No `npm run` command or file path is ever shown to the end user in the UI — empty-data states say what's happening (downloading, or press "Update data now") instead.
- First launch therefore has no hero/item/matchup data at all until it downloads: `app.whenReady()` checks for this (`!heroDb && !kitsDb && !timingsDb`) and calls `refreshData()` immediately, skipping the usual 60s debounce that exists only to avoid re-checking on every ordinary launch. The window shows and is usable instantly either way; `dataStatus` (Heroes page progress bar) reflects the download without blocking anything.
- Live coach scores GPM/XPM/last-hits against that hero's benchmark percentiles, tracks item achievements, and gives tips.
- Draft reveal: Dota sends picks in waves (or all at once in Turbo) via GSI `draft` when it chooses to; the app merges whatever arrives and keeps typed picks.

## Data sources (all free, public, allowlisted)
| Source | Used for |
|---|---|
| OpenDota `/heroes/{id}/matchups`, `/heroStats`, `/benchmarks`, `/heroes/{id}/itemPopularity` | counter pairs, rank/pro/turbo win rates, per-hero GPM/XPM/LH percentiles, item stages |
| OpenDota `/scenarios/itemTimings` | win rate by item purchase time -> coach achievement targets |
| Valve `dota2.com/datafeed/patchnoteslist` + `patchnotes` | which heroes changed in the latest patches -> older matchup data down-weighted, "patched" markers |
| Valve `dota2.com/datafeed/herodata` | stats, role levels, abilities (kits.json) -> mechanics model |
| `dotaconstants` (npm) | hero/item/patch catalogue |
| Local game files + Steam | build number (`steam.inf`), default item builds, signed-in account |
Considered, not used: STRATZ GraphQL (needs a token and sits behind Cloudflare), Steam Web API match history (needs a key; OpenDota already covers it, and Valve gates match history behind the same "Expose Public Match Data" setting as OpenDota regardless of API key, so it adds nothing when that setting is off).
- **No download/export exists for a private player's own match history.** Checked: Steam's GCPD page (`steamcommunity.com/my/gcpd/570/`) is a rendered webpage, not a file, and the Steam Web API's match-history endpoints require that same Dota client setting to return anything at all — there is no self-auth bypass. The two real options with that setting off are (1) the GSI listener's own local capture (`saveOwnMatches`, below) or (2) hand-typing a manual CSV backfill (Settings -> "Matches without public sharing"); the app leads with (1).

## Game mechanics model (`src/shared/mechanics.ts`)
- **Computed (exact):** attribute scaling (STR 22 HP, AGI attack speed and 1/6 armor, INT 12 mana, universal 0.7 damage), armor reduction `0.06A/(1+0.06|A|)`, magic resistance, attack time, damage per second, and a Lanchester-style 1v1 duel (HP x DPS after armor).
- **Inferred:** every ability's effects (stun, silence, mute, root, hex, disarm, slow, fear, taunt, sleep, break...) from Valve's text; damage type and BKB-piercing from Valve's data fields. Data file `data/kits.json` (`npm run data`, or in-app update).
- **Learned:** a non-negative ridge regression over every hero pair in the seed finds how much each mechanic shifts win rates beyond overall hero strength. Where public data is silent a small game-knowledge floor applies. Prior strength comes from the data itself (empirical Bayes).
- **Used as the prior** for every matchup in the ranking: lots of real games override it, no games leave only the mechanics. Lineup analysis (damage mix, control counts, BKB-piercing, stealth) drives the "what to change" list with items.
- Ranking = matchup edge (vs what overall strength predicts) + position fit (Valve role levels) + team composition + base strength + your comfort. A hero that is merely strong is not shown as a counter.

## Game dynamics (own game feed only)
- First blood (which team, you or not), double/triple/ultra kill and rampage (kills chained within 18 s), kill streaks, and a kill-lead momentum graph come from your own kill count, kill streak and the public team score.
- Tower, Roshan and barracks state are **not** in a player's feed (spectator-only `buildings` is blocked by the guardrails). They appear post-match in Match Review's Objective timeline, from OpenDota's parsed replay, with Dota's own gold/XP advantage graph.
- The overlay adapts by phase (laning: lane tools; mid game: goals + momentum; late game: essentials) and shows animated achievement pop-ups. A trophy case on Live & Coach keeps career counts.
- **Achievements page**: item/timing goals scored from each hero's own real OpenDota item-popularity and timing data (`src/shared/coach.ts`), never a fixed hero or item list — whichever hero and role you actually play earns its own record (`src/shared/live-coach.ts: observeAchievement`), keyed per hero so Anti-Mage's Battle Fury and Troll Warlord's Battle Fury track separately. Works in practice, normal and ranked games alike. Awarding one plays a short synthesized chime (`src/renderer/sound.ts`, no bundled audio) when "Dota achievement sound" is on.
- Playstyle (Hard Carry, Tempo Core, Frontline Initiator, Dynamic Support, Utility Support, plus Endurance/Aggression/Survival/Farm traits) is learned from your last 40 matches. The coach also adapts its scoring role per hero from the role you usually play it in.
- **Roshan/Aegis timer** (`src/shared/roshan.ts`) is a manual stopwatch started by the player. Use the dashboard buttons or Ctrl/⌘+Alt+F6 (both), F7 (Roshan), F8 (Aegis), or F9 (clear). Window: Roshan 8:00–11:00, Aegis expires at 5:00 — approximate, Valve has changed these before. Feature-toggleable (`roshanTimer`).

## Puter AI coach
- An optional AI Q&A layer (`@heyputer/puter.js`), signed in from Settings, token stored via `safeStorage` (OS keychain), never sent anywhere but `api.puter.com`/`puter.com` (both allowlisted).
- The prompt (`buildPuterPrompt` in `src/main/index.ts`) is grounded in the app's own real data, not left to the model to guess: the selected hero's actual ability tags from `kits.json` (ultimate/passive, damage type, BKB-piercing, status effects), recent Valve patch notes that touched that hero, your computed matchup edge vs the known enemies (same pair data the draft ranking uses), and the top 3 matching entries from the built-in glossary (`src/shared/knowledge.ts`) — a local lookup, no extra network call. Where the app has no data for something, the prompt tells the model to say so rather than invent a number.
- Capped at 650 output tokens per answer; the Know page's own on-page knowledge search works at `src/shared/corpus.ts` (hero kits + items + recent patch notes + glossary, ~700 docs, memoized in `getCorpus()`) and works without calling the AI at all.
- The prompt tells the model to answer in plain prose (no markdown headings/bold/bullets, no emoji) so it reads naturally in-app; `stripMarkdown()` in `src/main/index.ts` also cleans the response defensively in case the model ignores that.
- **Keychain/DPAPI persistence — verified, with a real limitation found and fixed.** `safeStorage` backs onto the OS keychain on macOS and DPAPI on Windows automatically (Electron's own abstraction, no platform-specific code needed; not independently tested on Windows from this Mac). On macOS specifically: `safeStorage.decryptString` is **synchronous**, and a keychain item's ACL can be scoped to the signing identity that created it. Built two throwaway apps with different ad-hoc signatures (`codesign --sign -`, same as this app's own packaging) and confirmed decrypting one's blob under the other **hangs with no catchable error**, not a clean rejection — a real risk for an ad-hoc-signed app across rebuilds, since a synchronous hang in the main process stalls everything (GSI, broadcasts, all IPC), not just that one call. Fixed: `getPuterClient(attemptDecrypt)` only touches the stored token on a deliberate user action (sign-in, ask, sign-out); the eager startup check (`puterStatus()`, called from `index.tsx` on mount) never attempts the decrypt, so a stale token from an older build can no longer freeze the app on launch — verified by seeding a fake stored token and confirming the app replies in milliseconds instead of hanging. A real distribution Developer ID signature (stable identity across rebuilds) would remove the underlying risk entirely; ad-hoc signing (the only option without a paid Apple cert) cannot.

## Overview and guides
- The Overview stage features the hero you played most in your last 30 matches: Steam CDN render, Valve hype text, your games/win rate/KDA/GPM/XPM/last hits with benchmark percentiles.
- Paper sections (skills, Valve base stats, matchups, tips, recent patch notes) come from `dota2.com/datafeed/herodata`, OpenDota lane-role and game-length win rates, and the patch-notes feed. Cached 24 h.
- Graphs: recent form, hero pool, skill radar, GPM per match, performance trend, team gold lead in Match Review.
- Lane support: with enemy picks known, the coach card shows your win rate against each (red below 48%, green above 52%) and item/play advice for their lineup.

## Self-learning and self-updating
- **Patch-aware profile:** your history/reviews are re-weighted on every run: recency half-life 120 days, and each patch older than the current one keeps 65% of its weight.
- **Fitted weights:** a small logistic regression on your saved matches decides how much hero comfort counts vs counter edge (needs 25+ matches; bounded; defaults until then).
- **Personal baselines:** the live coach also compares you to your own average GPM/XPM/LH on the hero.
- **Auto data refresh:** a new Dota build (steam.inf) or data older than 14 days triggers a background refetch into the user data folder, which overrides the bundled seed/hero data. `Heroes -> Update data now` forces it.

## Guardrails
`src/shared/guard.ts` (host + GSI-section allowlists) and `tests/guard.test.mjs` (build fails on capture/injection/memory APIs or unlisted hosts).

## Flow
1. First run: detect Dota install + Steam user -> offer "Use my Steam account" -> history loads.
2. Install GSI cfg (one click into `game/dota/cfg/gamestate_integration`), add `-gamestateintegration` launch option.
3. Draft: type enemy picks (dashboard, or overlay hotkey Ctrl/⌘+Shift+F9). Suggestions appear instantly from seed, upgrade when live data lands.
4. In game: live coach/lane card (any practice, normal or ranked game — GSI own-player data only, never reads opponents or hidden info). Ctrl/⌘+Shift+F10 hides.
5. After game: open match -> review -> profile relearns.
6. After a Dota patch: watcher flags it; `npm run seed` refreshes the offline table; nudges halve until you re-confirm.

## Updating
- Game patches: automatic detection (above). Optional: re-run `npm run seed`.
- App updates: set `dotaImproviser.updateRepo` (`owner/repo`) in `package.json`; Settings -> Check for app updates reads that repo's latest GitHub release.
