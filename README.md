# Dota Improviser

A local-first Dota 2 companion for match history, post-match review, manual draft analysis, and local practice on Windows and macOS.

## Run

Use Node.js 24 or newer.

```sh
npm ci
npm run dev
```

The app opens a labelled sample workspace. Use the signed-in Steam account detected on this computer, add another numeric Dota account ID (friend ID or SteamID64), or open a completed match by ID. The Overview can launch Dota 2 and shows whether the local install and Steam account were found. The app reads only Steam `loginusers.vdf`, Dota `steam.inf`, and Dota `itembuilds/`; Dota's own item builds and the opt-in player-visible GSI feed work locally. The Dota client does not provide completed match history through these local files, so history and parsed replay details use cached or public OpenDota data. Dota's **Expose Public Match Data** setting affects history coverage. Missing roles and replay fields appear as unavailable.

```sh
npm test
npm run package:local
```

`npm run package:local` builds the Apple Silicon app in `release/`. Use `npm run package:mac` for both Mac architectures or `npm run package:win` for Windows x64 when distributing test builds. These are private test builds. Test and sign distributable builds on the target platforms before sharing publicly. For a browser-only sample preview, run `npm run preview`.

## Plan items from your own matches

Open **Draft & Builds → Build planner**, pick a hero, then choose **Load recent purchases**. The planner checks up to 12 recent All Pick matches for this hero and learns from purchase logs in up to 20 saved matches. Select an item to see the first-buy timeline, source values, effects, and estimated stats at levels 1–30. Compare an edited purchase order with your usual build using the same gold and XP rates. **Approve build** saves the item order to your local profile for that hero. In a local practice run, the overlay shows your next planned item and checks off items it sees in your inventory.

## Connect a local practice match

1. Add your account ID in the app and open **Live Setup**.
2. Use Steam's **Browse local files** for Dota 2. Create `game/dota/cfg/gamestate_integration` inside that installation if needed, then save the generated `gamestate_integration_dota_improviser.cfg` there.
3. Add `-gamestateintegration` to Dota 2's Steam launch options and restart Dota.
4. Start the practice listener and enter a local practice lobby with your own hero. Show the overlay in windowed or borderless mode, or choose **Companion** and keep Live Setup open on a second display. **Ctrl/⌘ + Shift + F10** hides the overlay.
5. To create a personal last-hit baseline, open one of your matches in Match Review and choose **Load comparable matches**. The live card uses saved, parsed All Pick history for your selected practice role. It needs two or more comparable matches at each checkpoint.

The listener accepts Dota's GSI POSTs on `127.0.0.1:43182`. The generated config contains a local token. Clearing data rotates that token, so save a fresh config afterward. Redacted diagnostics contain field types, broad session categories, and validation results. Raw live packets are transient.

## Release qualification

The practice card is gated to the own-player packet shape, the selected Steam account, a zero match ID, and supported game phases. An explicit non-practice lobby type is rejected when Dota supplies it. Ranked live is disabled. For each platform, verify real local practice and bot payloads against the scoreboard, then confirm spectating, replays, nonzero match IDs, and unknown states clear the card. Verify pause, reconnect, the hide shortcut, click-through, window focus, and display changes. A ranked overlay release requires a verified player-visible source and a documented basis under Valve's rules for each feature.

OpenDota provides public history, aggregate hero matchups, item purchase counts, and parsed match timelines. Sample workspace data is illustrative. Dota hero artwork is from [Valve's Dota 2 site](https://www.dota2.com/heroes), and catalog metadata comes from [dotaconstants](https://github.com/odota/dotaconstants). The [GSI reference implementation](https://github.com/xzion/dota2-gsi) documents the desktop connection. [dota-watch](https://github.com/c00kie17/dota-watch) is a reference for a future watch directory.

## Verified against a live Dota client (build 6975)
- GSI needs `-gamestateintegration` in Dota's Steam launch options. A `steam://run/570//-gamestateintegration/` link did not pass it.
- Pick phase: GSI sends `draft: {}` to players. Enemy and ally picks are **not** exposed, so type enemy picks (Ctrl/⌘ + Shift + F9). GSI does give your side (`player.team_name`) and your hero (`hero.id`) once locked; the app adds your locked hero to allies automatically.
- `player.steamid` in the feed matches the Steam account detected from the local Steam login file.
- This build sends no `map.lobby_type`; practice is recognised by `matchid` of zero. Ranked/real matches carry a nonzero match ID and stay disabled.
- Dota posts about 25 packets/s; the app coalesces UI updates to about 2/s.
- The listener auto-starts when an account is linked and the GSI config is installed.
- Overlay: verified visible over Dota on macOS (pick phase, auto-opened). Windows borderless not yet verified; exclusive fullscreen cannot be overlaid.
