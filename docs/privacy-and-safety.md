# Privacy and fair-play boundaries

Dota Improviser is a stats and practice companion. Its data boundaries are enforced in code and tests, not just described in the interface.

## Allowed inputs

- Valve's opt-in Game State Integration feed, limited to approved player-visible sections and supported own-player practice data.
- Public OpenDota aggregates and match data. Public history coverage depends on the Dota account's **Expose Public Match Data** setting and whether a match has been parsed.
- Public Valve Dota feeds for hero information and patch notes.
- Read-only local discovery of Steam `loginusers.vdf`, Dota `steam.inf`, and Dota `itembuilds/`.
- Heroes and picks the player manually selects or types.
- Optional Puter AI context explicitly selected by the player and the question they submit.
- OS-reported foreground Dota window bounds, used only for overlay placement. No window contents, titles, or game data are collected through this path.
- **Draft vision** (opt-in, off by default): one narrow, strictly phase-gated exception, in `src/main/draft-vision.ts` only. It captures the Dota window and crops a single thin strip — the pick-bar hero portraits — comparing each slot against Valve's own small hero icons, and only while Dota's own GSI `game_state` reports hero selection, strategy time, or the captains draft. Every entry point takes `inPickPhase` as an explicit, caller-supplied boolean and returns immediately when it is false; `tests/guard.test.mjs` asserts this directly and fails the build if that gate is ever removed. It never performs text OCR, never reads chat/minimap/buildings, and never runs once a match is live. See AGENTS.md's "Draft vision" section for why this one exception exists and its real, undocumented-away limitation (slot positions are resolution/UI-scale sensitive, same as every other portrait-matching draft tool).
- User-pasted completed scoreboard rows and, when separately enabled, the linked player's own completed-match GSI summary. Up to 20 local matches are stored on the device and no private replay or account session is accessed.

## Not used

The project must not add code or dependencies that:

- Read or write Dota process memory, game files that contain live state, or hidden game state.
- Capture or scrape the screen, use OCR, or inspect game visuals — outside the one narrow, phase-gated "Draft vision" exception described above, which is never used once a match is live and never reads anything beyond the pick-bar portrait strip.
- Read, sniff, intercept, or decode Dota network traffic.
- Inject keystrokes, mouse actions, commands, or other inputs into Dota; automate hero movement, spells, purchases, or other gameplay.
- Request spectator-only GSI sections or infer unrevealed enemy picks through GSI itself (Draft vision reads the player's own visible screen, not a hidden GSI section).
- Provide ranked live coaching. The current practice gate and platform qualification are release requirements.

## GSI data handling

GSI is opt-in: the user installs a per-install config and enables Dota's `-gamestateintegration` launch option. Updates go to `127.0.0.1:43182` and must include the local token. The main process validates the sender context and allowlists fields before sending derived data to the overlay. Raw packets are transient and diagnostic exports are user-initiated and redacted. A stale connection or unsupported context clears live values.

The current approved section set is `provider`, `map`, `player`, `hero`, `items`, and `draft`. Payloads may differ by mode and phase; the implementation must continue to check real samples before exposing a field. Never add `allplayers`, `buildings`, `wearables`, `minimap`, or `events` without a safety review and an approved product use.

## Network and account privacy

- OpenDota, Valve, GitHub release metadata, Steam CDN artwork, and Puter are external services. Requests are constrained by `src/shared/guard.ts` and tested by `tests/guard.test.mjs`.
- The app reads the local Steam account list to offer account selection. It does not need a Steam Web API key or a Steam password.
- Match history and saved reviews stay in the local SQLite database. Do not add them to Puter prompts or other outbound requests without changing the privacy design and asking the user.
- Puter is optional and user-initiated. The browser handles sign-in; the app receives a session token through a one-time state-checked loopback callback. The token uses OS secure storage where supported. The AI receives the question, selected hero/picks/items, app-derived hero/patch/matchup/reference facts, and supported own-player practice values. It does not receive the Steam account ID or personal match history.
- Users can disconnect Puter and clear local app data from Settings. A GSI config contains a local token; regenerate/install it after clearing app data.
- The repository is public, so update checks and downloads need no token or credential at all; they use GitHub's unauthenticated API and must match the published size and SHA-256 digest.

## Ranked release gate

Ranked live coaching remains disabled. Before enabling any ranked live feature, document for that exact feature and target platform:

1. The player-visible source and why it is available to the player at that moment.
2. The game modes and phases where it is shown.
3. Why it does not disclose hidden enemy information or automate a decision/input.
4. The applicable Valve rules and a defensible basis for the feature under those rules.
5. Windows and macOS verification, including disconnect/stale behavior and spectator/replay rejection.

Valve's rules and enforcement policies can change. Recheck their current terms before making a ranked-release decision; this project does not claim Valve's approval.

## Report a boundary issue

If a change appears to expose hidden information or use an unapproved input source, stop the release work and inspect the affected source and tests. Fix the data path, add a regression test, and update this document before enabling the feature.
