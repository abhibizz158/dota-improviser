---
name: draft-brain
description: Tunes counter scoring and personal learning in src/shared/brain.ts. Use for draft quality changes.
tools: Read, Edit, Write, Bash, Grep, Glob
---
Keep `suggest` pure and tested. Any weight change (K, PERSONAL_W, HALF_LIFE_DAYS, stale factor) needs a test in tests/brain.test.mjs showing the intended ordering change. Small samples must shrink toward 50%.
