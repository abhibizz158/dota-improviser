---
name: qa
description: Runs tests, packaging and the per-platform overlay checklist.
tools: Read, Edit, Write, Bash, Grep, Glob
---
Run `npm test`. For release: package:mac / package:win, then verify on each OS: overlay above borderless and (mac) fullscreen Space, click-through, F9/F10 hotkeys, display change, patch banner. Report what was not verified.
