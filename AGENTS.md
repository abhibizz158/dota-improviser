# Dota Improviser: agents and flow

Stats-only companion. **No** memory reading, input injection, packet sniffing, or hidden-info extraction. Gameplay inputs: Valve GSI (player-visible, opt-in cfg), public OpenDota aggregates, local read-only files (`steam.inf`, `itembuilds/`, Steam `loginusers.vdf`), and picks the user types. For overlay placement only, the main process may use the OS-reported foreground Dota window bounds. One deliberate, narrow, opt-in exception to "no screen scraping" exists — see "Draft vision" below — strictly gated to pick/strategy phase and never used for anything else.

## Draft vision (the one screen-reading exception)
Off by default (`draftVision` feature, Settings). The ONLY screen-reading code in the app is `src/main/draft-vision.ts`, and every entry point there takes an explicit `inPickPhase` boolean the caller derives from Dota's own GSI `game_state` (hero selection / strategy time / captains draft) — it bails out immediately when that's false, and never runs once a game is live. It captures the Dota window, crops a single thin strip at the top (the pick-bar portraits), and compares each slot against Valve's own small hero icons (already fetched from Steam's CDN for the app's own portrait grid) — never text OCR, never chat/minimap/buildings, never anything outside that strip. A match feeds into the same `applyReveal()` wave-merge GSI picks already use.
- **Why this one exception exists:** Valve's GSI genuinely never sends enemy/ally picks outside captain's own client (verified live, build 6975) — this is the only way to read something that's already visible on the player's own screen, same category as Dota overlay tools like [counterdraft](https://github.com/naghim/counterdraft) and [dota-counterpick-overlay](https://github.com/gestevao04/dota-counterpick-overlay) do.
- **Real limitation, not fixable:** the slot crop positions are fractions of window size calibrated for a typical 16:9 draft screen. A different aspect ratio or UI scale can throw them off — every portrait-matching draft tool in this space documents the same limitation. Settings → "Test draft vision" captures once and shows exactly what was read, for checking/retuning.
- **Enforced, not just promised:** `tests/guard.test.mjs` still bans every screen/memory/input/packet-capture API everywhere else in the tree, and specifically asserts this one file's two capture functions take `inPickPhase` first and bail out when it's false — the build fails if that gate is ever removed.
- **macOS:** the OS will prompt for Screen Recording permission the first time this feature actually captures.

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
- **Achievements page**: item/timing goals scored from each hero's own real OpenDota item-popularity and timing data (`src/shared/coach.ts`), never a fixed hero or item list — whichever hero and role you actually play earns its own record (`src/shared/live-coach.ts: observeAchievement`), keyed per hero so Anti-Mage's Battle Fury and Troll Warlord's Battle Fury track separately. Counted in ranked/normal matchmaking games only — practice lobbies don't count toward the career trophy case. Awarding one plays a short synthesized chime (`src/renderer/sound.ts`, no bundled audio) when "Dota achievement sound" is on.
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

## Performance
- React/icons are split into their own `vendor-*` chunks (`vite.config.ts` `manualChunks`) so an app update's own code can be refetched without re-downloading libraries that didn't change; this dropped the main bundle below Vite's 500 kB chunk-size warning.
- The renderer never computes anything expensive twice: `getCorpus()`, hero detail, draft rankings and the matchup/profile models are all memoized against their real inputs and only rebuilt when a dependency actually changes.
- Backgrounded correctly instead of "optimized" with invented knobs: Electron's `backgroundThrottling: true` lets the OS throttle windows that aren't visible; the patch watcher runs every 10 minutes and the self-update check every 6 hours, not on a tight loop; the overlay is a small (360x186) non-shadowed panel, not a full-screen transparent surface. There's no lever here called "GPU utilization" or "garbage collection" to add — V8 already manages memory, and Electron's own throttling already covers idle windows; inventing toggles for these would be decoration, not optimization.

## Flow
1. First run: detect Dota install + Steam user -> offer "Use my Steam account" -> history loads.
2. Install GSI cfg (one click into `game/dota/cfg/gamestate_integration`), add `-gamestateintegration` launch option.
3. Draft: type enemy picks (dashboard, or overlay hotkey Ctrl/⌘+Shift+O, which opens draft editing before a hero is live and the AI assistant once one is). Suggestions appear instantly from seed, upgrade when live data lands.
4. In game: live coach/lane card (any practice, normal or ranked game — GSI own-player data only, never reads opponents or hidden info). Ctrl/⌘+Shift+H hides; Ctrl/⌘+Shift+C toggles Compact/Large.
5. After game: open match -> review -> profile relearns.
6. After a Dota patch: watcher flags it; `npm run seed` refreshes the offline table; nudges halve until you re-confirm.

## Updating
- Game patches: automatic detection (above). Optional: re-run `npm run seed`.
- App updates: the repo is public, so `ReleaseUpdates` (`src/main/release-updates.ts`) polls its releases every 6h plus shortly after launch with no token needed, and downloads + sha256-verifies a matching installer automatically once one exists, all in the background. A GitHub token (Settings) is optional, only useful past GitHub's unauthenticated rate limit (60 requests/hour). With the "Launch verified updates automatically" feature on, it then launches that verified installer itself as soon as you're not mid-game, instead of waiting for a click in Settings. It still can't make that launch invisible: this app's own fair-play guardrail (`tests/guard.test.mjs`) blanket-forbids spawning other processes anywhere in the source tree, and macOS separately requires your password for anything outside your own account — both are deliberate, not gaps to route around.
