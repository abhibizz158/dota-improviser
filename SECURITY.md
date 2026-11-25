# Security policy

## Reporting a vulnerability

Please report security issues privately, not in a public issue:

- Use GitHub's **Report a vulnerability** button on this repository's Security tab (private advisory), or
- Email abhishekbizz.156@gmail.com.

Include what you found, the app version (Settings → About, or the installer name), your OS, and steps to reproduce. Please don't include anyone's real account data.

You should get an acknowledgement within 7 days. Fixes ship as a normal app update; the release notes say when an update fixes a security issue so users know to install it.

## Scope

In scope: the desktop app (main process, overlay and dashboard), its local game-state receiver, its update and data-download paths, the official installers on the Releases page, and the website dotaimproviser.pages.dev (report only: no flooding, no testing that disrupts it or touches other people's data).

Out of scope: OpenDota, Valve, GitHub, Puter and Steam themselves (report those to their owners), and modified or redistributed builds.

## What the app is designed not to do

The fair-play and privacy boundaries — no game-memory access, no input injection, no network sniffing, no live-match screen reading, a fixed host allowlist — are described in [docs/privacy-and-safety.md](docs/privacy-and-safety.md) and enforced by `tests/guard.test.mjs`. A way to break any of them is a security issue worth reporting.

## Known limitation

The installers are not yet code-signed with a paid certificate (Authenticode on Windows, Developer ID on macOS). The app verifies a downloaded update's size and SHA-256 against the GitHub release before launching it, but that checks integrity in transit, not who published it. Only download installers from this repository's Releases page.
