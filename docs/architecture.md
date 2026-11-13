# Architecture and data flow

Dota Improviser is an Electron application with a React/TypeScript renderer, a privileged desktop main process, a narrow preload API, and a local SQLite store. It keeps match history and preferences on the device; the app does not require a project-owned backend.

## Process boundaries

```text
React dashboard / overlay
          │ typed, allowlisted IPC
          ▼
Electron preload bridge
          │
          ▼
Main process ── GSI loopback receiver (127.0.0.1:43182)
     ├─────── OpenDota / Valve / GitHub / Puter allowlisted requests
     ├─────── read-only Steam and Dota discovery
     └─────── local SQLite + generated data cache
```

- **Renderer** (`src/renderer/`): Overview, Draft & Builds, Heroes, Live & Coach, Match Review, and Know views. The renderer receives app-shaped data over the preload bridge; it does not read local game files or open arbitrary connections.
- **Preload** (`src/main/preload.cts`): exposes the typed `AppApi` implemented by `src/shared/model.ts`. Keep this surface explicit and narrow.
- **Main process** (`src/main/`): owns SQLite, external provider requests, local-file discovery, patch watcher, GSI validation, recommendations, and overlay window lifecycle.
- **Shared logic** (`src/shared/`): matchup ranking, item/hero mechanics, coach tips, history analysis, searchable knowledge, and GSI allowlists. Keep logic deterministic and testable where possible.

## Data sources

| Input | Where it is used | Stored? |
| --- | --- | --- |
| OpenDota public endpoints | History, parsed reviews, matchup/item aggregates, benchmarks | Response cache and user-selected history/reviews in local SQLite |
| Valve Dota data feeds | Hero kits, hero stats, and patch notes | Refreshed dataset/cache in local app data |
| `dotaconstants` package | Hero/item/patch catalogue and item metadata | Bundled with the app |
| Steam `config/loginusers.vdf` | Detect the local Steam account | Read-only; account ID can be saved locally when selected |
| Dota `game/dota/steam.inf` | Local game build and patch detection | Read-only; latest build marker saved locally |
| Dota `itembuilds/` | Discover local item builds | Read-only |
| Dota GSI | Allowlisted own-player values in supported local practice | Raw updates stay in memory; only derived snapshots/checkpoints needed by the current session are retained |
| User-selected heroes/items and typed picks | Draft, item planning, and AI question context | Local app state; no hidden picks are inferred |
| Puter AI (optional) | Answer a user-submitted strategy question | Selected context is sent to Puter; no personal match history or Steam ID is sent |

### Generated data

`npm run data` creates four ignored JSON files in `data/`:

- `seed.json`: public hero-vs-hero matchup pairs.
- `heroes.json`: public bracket win/pick counts, benchmarks, and item-stage popularity.
- `kits.json`: Valve hero data with tagged abilities and role levels.
- `timings.json`: public purchase-time aggregates for selected items.

The seed and hero datasets use OpenDota. The kits dataset uses Valve's Dota data feed. Item timings depend on `heroes.json`, so the build scripts run in that order. Generated developer snapshots in `data/` are ignored. Desktop packages include the reviewed public snapshots in `starter-data/`. Production refresh saves progress and replaces completed datasets under the user's app data directory.

## GSI and overlay path

1. The user installs the generated `gamestate_integration_dota_improviser.cfg` and enables Dota's `-gamestateintegration` launch option.
2. Dota sends token-authenticated HTTP updates to the loopback receiver.
3. The main process validates message size, token, selected account, context, phase, and field allowlist before producing an app `LiveState`.
4. The practice gate rejects unsupported, stale, unknown, spectator/replay, and non-practice contexts. The overlay receives only the filtered state.
5. The overlay is click-through and does not send game input.

**Follow Dota** uses a small native helper to read only the OS-reported bounds of the foreground Dota window. On macOS it uses the Dota bundle identity and Core Graphics window geometry; on Windows it verifies the foreground executable and reads its client area. The main process maps those bounds to Electron's display coordinates, intersects them with the display work area, and places a separate overlay window. It does not capture pixels, inspect window titles, or read any game state. It checks for movement only while the automatic overlay is enabled and pauses while editing. A manual monitor choice is available when the OS does not provide usable bounds.

The player and spectator GSI payloads differ. Do not add spectator-only sections such as `allplayers`, `buildings`, `minimap`, `events`, or `wearables` to the requested sections. `src/shared/guard.ts`, `src/main/gsi.ts`, and `tests/guard.test.mjs` define and enforce the current boundary.

## Recommendation path

- Draft ranking combines sample-weighted matchup edges, hero strength, position fit, team composition, the player's saved hero comfort, and explicit manual adjustments. Sparse aggregates shrink toward neutral.
- Item timing uses listed item cost plus currently available own-player gold and GPM, or a saved personal purchase baseline. It is a rough planning projection; lane income, kill/assist gold, components, and future events change actual timing.
- Item stat previews apply item effects to hero base stats and level scaling. Display data quality and missing inputs rather than implying certainty.
- The learner rebuilds a local profile from saved match data; it does not train a separate model or upload personal match history.
- Puter answers use bounded selected context, local hero/patch/matchup lookups, and relevant local reference entries. The app asks the model to mark uncertainty and not invent missing data.

## Local state and network policy

The main process stores SQLite data in `Documents/.dota-improviser` on Windows and macOS. Puter session persistence uses Electron `safeStorage` when the operating system reports async encryption support. GSI credentials and the database stay on the machine. `src/shared/guard.ts` maintains the outbound host allowlist; tests fail if source code adds a hard-coded remote URL outside that list.

## Useful code locations

| Area | Files |
| --- | --- |
| Desktop lifecycle, IPC, overlay, data refresh | `src/main/index.ts` |
| GSI receiver, parsing, and practice context | `src/main/gsi.ts`, `src/shared/guard.ts` |
| External match-history provider and SQLite | `src/main/opendota.ts`, `src/main/store.ts` |
| Local Steam/Dota discovery | `src/main/local.ts` |
| Draft ranking and personal learning | `src/shared/brain.ts` |
| Hero/item mechanics and item learning | `src/shared/mechanics.ts`, `src/shared/items.ts`, `src/shared/timing.ts` |
| Coach and lane feedback | `src/shared/coach.ts`, `src/shared/guide.ts` |
| Searchable Know index | `src/shared/corpus.ts`, `src/shared/knowledge.ts` |
| Automated tests and policy checks | `tests/` |
