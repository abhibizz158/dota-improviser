# Build and release checklist

The package scripts create private test builds. Do not describe a build as ranked-approved or production-ready based only on a successful compile.

## Before building

- [ ] Use Node.js 24 or newer and a clean `npm ci` install.
- [ ] Install Python 3 and the native build toolchain for the overlay helper: Xcode Command Line Tools on macOS, or Visual Studio Build Tools with **Desktop development with C++** on Windows.
- [ ] Review the changed data sources, hosts, GSI fields, and dependencies.
- [ ] Run `npm test`. It builds the app and runs unit and fair-play guardrail tests.
- [ ] Confirm `npm audit --omit=dev` has no unresolved production dependency findings.
- [ ] Confirm no local SQLite database, `.env` file, Steam identity, GSI token, diagnostics export, or generated `data/` snapshot is staged.
- [ ] Refresh public data when needed with `npm run data`; inspect patch metadata, sample sizes, missing values, and source timestamps.

## Package scripts

```sh
npm run package:local      # Apple Silicon macOS local build
npm run package:mac        # Apple Silicon macOS test build
npm run package:win        # Windows x64 test build
```

Build on the target OS for final verification. The packaging script checks the Electron fuses, validates that the archive contains the license and release provenance, and excludes source maps and the development source tree. Release installers are published with SHA-256 checksums.

Keep publisher attribution in the package manifest. The package script includes it in the executable metadata and `.release-provenance.json` inside the archive. Attribution identifies the publisher and does not establish a signing identity. macOS test packages use an ad-hoc signature. For a production trust chain, use Developer ID signing and notarization on macOS and Authenticode on Windows. Electron integrity checks help detect modified packages. The publicly visible GitHub source can still be viewed and forked under GitHub's terms.

The **Build desktop test release** workflow packages the Windows x64 setup EXE and the Apple Silicon Mac PKG. It runs the test suite, verifies the native overlay helper, and runs the installer on each runner. Create a draft prerelease targeting the build's full commit SHA, then run **Attach verified desktop builds to release** with the build run ID and tag. It checks the build provenance and uploads the installers with SHA-256 checksums. Review the draft and publish it for testers with repository access.

## Desktop and dashboard checks

- [ ] Fresh install opens without blocking while public data refreshes.
- [ ] Empty, sample, unavailable, and error states explain what the player can do next.
- [ ] Account ID, completed match ID, anonymous match, parsed match, and unparsed match paths behave as documented.
- [ ] Draft ranking responds to partial picks and displays scope/sample size; sparse data stays visibly uncertain.
- [ ] Item stat projections, costs, build ordering, timing estimates, and personal purchase-learning states are internally consistent.
- [ ] Puter browser sign-in can complete and cancel/timeout safely; disconnect and clear-data remove the saved local token.
- [ ] Puter answers remain plain text and prompts exclude Steam IDs and personal match history.
- [ ] Provider errors, rate limits, missing datasets, patch refresh, and offline startup do not freeze the dashboard.
- [ ] Layout stays readable at typical laptop and desktop window sizes and at display scaling above 100%.

## GSI and overlay checks — repeat on Windows and macOS

- [ ] Install the per-install GSI config and verify the Dota launch option.
- [ ] Capture redacted samples from bot matches, local practice lobbies, disconnect/reconnect, and pause/resume.
- [ ] Confirm only the selected account's player-visible stats populate the lane card.
- [ ] Confirm spectator, replay, non-practice, nonzero match ID, unknown phase/context, malformed payload, wrong token, and stale data do not populate the live card.
- [ ] Confirm the overlay hides when the game context becomes unsupported and clears values on disconnect/staleness.
- [ ] Confirm click-through and overlay controls do not send any input to Dota.
- [ ] Confirm the automatic draft and lane cards never take focus. Open the editor explicitly, type and click picks, then verify Done, Escape, Alt/⌘-Tab, and leaving the editor restore click-through.
- [ ] Check windowed and borderless modes, focus changes, game pause, multi-monitor placement, display scaling, and monitor removal/reconnect.
- [ ] With **Follow Dota** and **Auto**, move the game between differently scaled displays, including one above or left of the primary monitor. Verify the lane card stays inside the padded top-right corner of the game area. Repeat for the draft card on the top left, then verify a manual monitor override.
- [ ] Check the documented hide/draft/detail shortcuts and confirm they do not conflict with the user's game input.
- [ ] Check macOS fullscreen Space and Windows fullscreen behavior; offer Companion layout where a topmost overlay is unavailable or unreliable.
- [ ] Observe idle CPU/memory and verify update coalescing keeps the companion light during sustained GSI traffic.

## Ranked feature gate

Ranked live features are **off by default**. Enabling one requires an explicit per-feature policy review, a verified player-visible source, platform checks on Windows and macOS, and a documented basis under current Valve rules. The GSI feed and successful overlay rendering alone do not establish that a ranked feature is allowed.

## After packaging

- [ ] Launch the packaged app from outside the project directory.
- [ ] Confirm expected local data auto-refresh works without bundled generated snapshots.
- [ ] Verify app updates require a repository-scoped GitHub token and reject downgrades, the wrong architecture, and downloads whose checksum does not match.
- [ ] Install over the previous version and confirm the linked account, preferences, local history, and saved Puter sign-in remain available.
- [ ] Record OS version, architecture, Dota build/patch, tested modes, known limitations, and artifact checksum.
- [ ] Keep the release private until the platform checklist and ranked policy gate are satisfied.
