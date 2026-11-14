# Dota Improviser

<p align="center"><img src="public/logo.svg" alt="Dota Improviser" width="104" /></p>

**A local-first Dota 2 companion for draft planning, item decisions, match review, and practice.**

Dota Improviser combines public match aggregates, read-only local Steam/Dota discovery, user-entered picks, and Dota's opt-in Game State Integration (GSI) feed. The dashboard and overlay are designed for Windows and macOS.

> **Fair-play status:** Draft suggestions use picks visible to the player. Live coaching uses the linked player’s own feed in supported sessions. The app does not read game memory, inspect packets, or automate inputs. One opt-in, off-by-default feature ("Draft vision") reads a small strip of your own screen — the pick-bar hero portraits — to match them against Valve's own hero art, strictly while Dota reports pick/strategy phase and never once a game is live; see [AGENTS.md](AGENTS.md#draft-vision-the-one-screen-reading-exception) for the full scope and its real limitation. Outside that one exception, the app never reads your screen or reveals hidden information.

**[⬇ Download the latest release](https://github.com/abhibizz158/dota-improviser/releases/latest)** — macOS (Apple Silicon or Intel `.pkg`) and Windows (x64 `.exe`).

On macOS, open the PKG for your chip. It installs or upgrades **Dota Improviser.app** in **Applications**. On Windows, run the x64 setup EXE. Quit Dota Improviser before upgrading. The installers leave your linked Dota account, settings, cached data, and saved Puter sign-in in the existing local profile. An ad hoc signed macOS update may require fresh Keychain or Screen Recording access.

On macOS 15.2 and later, open **Live & Coach → Test draft vision → Share Dota window** during Hero Selection or Strategy Time. Select Dota 2 in the macOS picker. That grant expires when the draft ends. If you prefer the persistent grant and the switch stays on after an update but capture fails, follow **Reset instructions** in the same panel.

The app checks for updates shortly after startup and every six hours with no setup needed, downloads a verified matching installer in the background, then offers **Install** in **Settings → App updates**. Connecting a GitHub token there is optional — only useful if you hit GitHub's unauthenticated rate limit (60 requests/hour).

## What it does

- **Overview and match history:** summarize recent games and show available win rate, KDA, GPM, XPM, last hits, denies, and performance trends. Coverage depends on OpenDota availability and Dota's **Expose Public Match Data** setting.
- **Match Review:** inspect parsed timelines, item timings, objectives, and performance against comparable games when the data exists. Unparsed or unavailable fields are labeled as such.
- **Draft & Builds:** manually enter revealed or known hero picks, compare counters and team fit, plan item purchases, inspect item effects and hero-level stat scaling, and save a personal build for practice.
- **Know:** search Dota terminology and mechanics, compare public hero matchup samples, and explore counter-item options. Purchase times are estimates based on observed GPM and unspent gold, not guarantees.
- **Live & Coach:** in supported local practice games, show an own-player lane card with the clock and available player-visible stats. Defensive lane advice and personal pace comparisons appear only when the necessary own-player data is available.
- **Optional Puter AI:** ask strategy questions grounded in selected app data. Sign in from **Settings → Puter AI** using your browser. The AI is optional; its model availability and usage limits are set by Puter.
- **Local Dota and Steam discovery:** detect the installed game, build number, Steam account selection, and local item builds. The local game files do not provide completed match history; that comes from public/cached OpenDota data or a match ID.

### Your history with public sharing off

Use **Overview → Import own matches** to paste up to 20 of your own completed scoreboards as CSV or tab-separated rows. The import dialog shows the column order and opens Steam's personal game data page. These rows stay on your device. To collect future games, opt in to **Save my completed match stats locally** in **Live & Coach** and connect GSI. It saves your own summary only when the feed supplies a completed result and cannot retrieve games from before it was enabled. The ranked overlay remains disabled.

## Requirements

- Windows 10/11 or macOS for the desktop app.
- Node.js 24 or newer and npm for development/building.
- Python 3 and a native C++ toolchain to build automatic display detection. See the [build checklist](docs/release-checklist.md).
- Steam and Dota 2 are optional for dashboard development, and needed for local game discovery and GSI practice setup.

## Run from source

```sh
git clone https://github.com/abhibizz158/dota-improviser.git
cd dota-improviser
npm ci
npm run dev
```

The first launch shows a sample workspace until you add a Dota account ID or open a completed match by ID. You can use a numeric Dota account ID, a SteamID64, or the Steam account detected on this computer. Signing into Steam is not required for the manual workflow.

## Local practice setup

1. Open **Live & Coach** and link the Dota account that will play the practice match.
2. Let the app locate Dota, or use Steam's **Browse local files** to find the installation.
3. Install the generated `gamestate_integration_dota_improviser.cfg` into `game/dota/cfg/gamestate_integration` in the Dota installation.
4. Add `-gamestateintegration` to Dota 2's Steam launch options, then restart Dota.
5. Start the listener and enter a supported local practice lobby. The overlay supports windowed/borderless play where available. Use **Companion** layout if an overlay cannot display reliably above the game.

In **Live & Coach → Display preferences**, select **Follow Dota** and **Auto** placement to put the draft card in the upper left and the lane card in the upper right of the detected game window. Pick a specific monitor and corner if you prefer. The cards pass clicks through to Dota.

Three hotkeys (plain letter chords rather than function keys, which are Fn-shifted media keys on most laptops on both Windows and macOS): **Ctrl/⌘ + Shift + O** opens the overlay in interactive mode — edit draft picks before a hero is live, ask the AI assistant once it is; **Done**, **Esc**, or leaving the editor restores click-through. **Ctrl/⌘ + Shift + C** toggles Compact/Large card size. **Ctrl/⌘ + Shift + H** shows or hides the overlay.

The GSI receiver listens on `127.0.0.1:43182` and authenticates updates with a per-install token. Live updates are transient; raw packets are not retained. The app validates updates in the desktop process and only exposes allowlisted own-player data. Clearing local app data also rotates the token, so reinstall the generated config afterward. Spectator/replay contexts, unknown contexts, stale updates, and unsupported matches must not populate the live player card.

## Draft suggestions for All Pick

The shortlist updates as visible teammate and enemy picks are revealed in Ranked and Unranked All Pick. It uses your selected role, hero pool, known bans, team needs, and matchup or ability evidence. Picks that Dota still conceals are excluded. After you lock your hero, the overlay shows the revealed lineup and carries it into live coaching. Use **Ctrl/⌘ + Shift + O** to enter visible picks manually.

On Windows, use **Borderless Windowed** or **Windowed** for Draft Vision. Keep Dota unminimized and run both apps at the same privilege level. If the game covers the overlay, choose **Companion** layout in **Live & Coach**.

## Live item recommendations

The live overlay suggests one matchup item in Compact mode and up to two in Large mode. Suggestions consider your role, hero level, game phase, owned items, gold and current GPM. They use the known enemy lineup and update as you buy items. The displayed purchase time is an estimate. You can turn the card off under **Live & Coach → Features → Matchup item recommendations**.

## Match outlook

The overlay shows an estimated team win chance and a compact trend line. Live & Coach lists the available factors, and Overview retains the chart for recorded completed games. The estimate uses the visible lineup, team kills and your own feed. It does not use hidden enemy gold, XP or objectives. A verified matchmaking win earns **Against the odds** if your team was behind on kills with estimates below 50% at two consecutive samples after minute five.

## Puter AI and privacy

Puter is optional and runs only when asked. Live questions use a compact context and short answers. Learn from my matches can reuse earlier answers in matching situations. Open **Settings → Puter AI → Sign in with Puter** to use the browser-based login. The app stores the session using Electron's OS-backed secure storage when available; otherwise, it keeps the session for the current run. You can disconnect Puter or clear the app's local data in Settings.

When you ask a question, the app may send the question, selected hero and picks, selected item data, relevant local hero/patch/matchup references, and supported own-player practice values such as clock, GPM, and unspent gold. It does **not** send Steam account IDs or personal match history to Puter. Review each prompt before submitting it. Puter usage is governed by your Puter account and its current plan.

See [Privacy and fair-play boundaries](docs/privacy-and-safety.md) for the full data-flow summary.

## Data sources and limitations

- **OpenDota:** public match history, parsed match details, hero matchups, benchmark percentiles, item popularity, and item timing aggregates. Results may be missing, delayed, rate-limited, or unavailable for private matches.
- **Valve Dota data feeds:** hero/ability metadata and patch notes.
- **dotaconstants:** hero, item, and patch catalogue.
- **Local Steam/Dota files:** read-only discovery of `loginusers.vdf`, `steam.inf`, and `itembuilds/`.
- **Dota GSI:** explicit local opt-in for player-visible game updates. GSI output varies by mode and phase; the application only uses verified, allowlisted fields.
- **Manual picks:** the player may type picks that Dota has not exposed. The app does not infer or reveal unrevealed enemy picks.

Recommendations are guidance, not predictions or instructions. Matchup sample sizes and data scope should be considered before drawing conclusions. Review the rules of your match or tournament before using an overlay.

## Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Build and launch the Electron app |
| `npm run check` | Type-check renderer and desktop-process code |
| `npm test` | Build and run unit and fair-play guardrail tests |
| `npm run build` | Create the production UI and desktop-process build in `dist/` |
| `npm run preview` | Build and serve the sample UI locally |
| `npm run data` | Fetch/rebuild the generated public hero, matchup, kit, and timing datasets in `data/` |
| `npm run seed` | Rebuild only the hero matchup seed |
| `npm run package:local` | Package a local Apple Silicon macOS app |
| `npm run package:mac` / `npm run package:mac-intel` | Package macOS Apple Silicon / Intel test builds |
| `npm run package:win` | Package a Windows x64 test build |

`npm run data` makes many public requests and can take several minutes; respect OpenDota rate limits. Generated `data/`, `dist/`, and `release/` artifacts are intentionally ignored by Git. The desktop app can refresh public datasets into its local application data folder. Use `npm test` before proposing changes to data parsing, GSI boundaries, draft scoring, or packaging.

Packaging scripts create **private test builds**. Build and verify on each target operating system before distributing. See [the release checklist](docs/release-checklist.md).

## Project documentation

- [Architecture and data flow](docs/architecture.md)
- [Privacy and fair-play boundaries](docs/privacy-and-safety.md)
- [Build and release checklist](docs/release-checklist.md)
- [Agent and contributor workflow](AGENTS.md)

## References

- [OpenDota API](https://opendota.apidocumentation.com/)
- [Valve Dota 2 data feeds](https://www.dota2.com/datafeed/herodata)
- [Dota Game State Integration reference](https://github.com/xzion/dota2-gsi)
- [Steam Hero Builds](https://www.dota2.com/workshop/builds/overview?l=english)
- [Puter authentication](https://docs.puter.com/Auth/signIn/) and [AI chat](https://docs.puter.com/AI/chat/)
- [Valve's Dota Plus lane and build suggestions](https://www.dota2.com/plus/?l=english)
- [Dota Watch](https://github.com/c00kie17/dota-watch), a reference for a separate match-discovery/watch feature

## License and publisher

Copyright © 2026 abhibizz158. Dota Improviser’s original code and official installers are available for personal use under the [Dota Improviser Personal Use License](LICENSE). Share the official release link. Redistributing, mirroring, repackaging, or selling the app requires written permission except where permitted by applicable law or the GitHub Terms of Service.

The installers carry publisher information in their packaged metadata and validate the bundled application archive. Apple and Windows signing are separate from this attribution. See the [build and release checklist](docs/release-checklist.md) and [third-party notices](licenses/README.md).
