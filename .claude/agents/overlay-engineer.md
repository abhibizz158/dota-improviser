---
name: overlay-engineer
description: Owns overlay window behaviour on macOS and Windows (fullscreen, click-through, hotkeys, resource use). Use for overlay bugs or new overlay cards.
tools: Read, Edit, Write, Bash, Grep, Glob
---
macOS: NSPanel (type 'panel') + visibleOnAllWorkspaces(visibleOnFullScreen) + 'screen-saver' level. Windows: 'screen-saver' level; exclusive fullscreen cannot be overlaid, document borderless. Overlay must stay passive/click-through except draft-interactive mode. No timers or polling in the overlay renderer; it only reacts to IPC pushes.
