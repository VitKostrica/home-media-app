# Media Center Project – Decision Summary

## Vision
A custom **TV-like media center** running on Linux, controlled entirely via
**remote-style inputs** (arrows / OK / Back), with a strong “wife approval” requirement:
- No keyboard thinking
- No desktop UI
- No tiny buttons or technical menus
- Predictable behavior identical to TV / Android TV apps

The system should feel like a native TV interface, not a Linux desktop.

App will open files from local storage, giving me option to choose player (play with MCP/VLC), but trackingg progress via jellyfin.

2 parts - both fullscreen kiosk mode (with closebutton)
    - home - for choosing custom media app / youtube / prime video etc
    - custom media app - for playing local movies and tracking progress with jellyfin

Navigating to homepage app via some shortcuts

## Based on current working setup

- Linux PC with 2 media folders - movies / shows
- Jellyfim nedia server
    - for creating thumbnails
    - downloading subtitles
    - keeping track pf watching progress
    - accounts (in future)
- W3 airmouse with key listener to homepage, that reopens home app

## Core Architecture - Custom media app

### Backend
- **Jellyfin** is the media backend and **single source of truth**
  - Media library
  - Watched state / resume position
  - Subtitles auto-download
  - Thumbnails
  - Multi-device sync (future Android support)

### Frontend (Linux)
- **Custom Electron app**
  - Acts as launcher and main UI
  - Fullscreen, kiosk-style
  - TV-like navigation with focus and animations
  - Owns all UX and input handling

### Player
- **MPV**
  - Chosen for smooth playback on Intel iGPU
  - Supports IPC control
  - Supports audio/subtitle switching
- **VLC**
    - best playback
    - mostly for more demanding titles, where other players lag

---

## Control Philosophy (Non-Negotiable)

### Input Model
Only these inputs are considered:
- ⬆️ ⬇️ ⬅️ ➡️
- OK / Enter
- Back

No keyboard shortcuts, mouse-only actions, or hidden controls.

### Button Meaning (Global)
- Arrows → move focus / seek
- OK → confirm / play / pause
- Back → go back one level or exit playback
- Back **never** opens menus or confirmations

---

## Playback UX (Final Model)

### Overlay Activation
- ⬇️ (Down) opens the **Playback Control Overlay**

### Overlay Layout

#### Row 1 – Timeline
- Horizontal scrub bar
- ⬅️ / ➡️ → move time cursor
- OK → jump to selected time
- ⬆️ → close overlay
- ⬇️ → move to row 2

#### Row 2 – Actions


Audio | Subtitles | Restart | Prev | Next


- ⬅️ / ➡️ → select action
- OK → execute or open submenu
- ⬆️ → return to timeline
- Disabled items are visually greyed out

---

## Audio & Subtitle Selection

### Entry
- From Playback Overlay → select **Audio** or **Subtitles** → OK

### UI Style
- Full-height **vertical list**
- Large text, TV-readable
- Smooth scrolling if many items

### Audio Example


Audio
────────────────

English (5.1)
English (Stereo)
Czech (5.1)
Commentary


### Subtitles Example


Subtitles
────────────────

Off
English
English (Forced)
Czech
Czech (SDH)


### Controls
- ⬆️ / ⬇️ → move selection
- OK → select and close
- Back → close without change

Playback continues uninterrupted.

---

## Episode Control
- **Restart** → restart current item immediately
- **Prev / Next** → handled via Jellyfin playlist logic
- Disabled if not applicable

---

## UI / UX Rules

- One overlay, one mental model
- Clear focus highlight (scale / glow)
- Smooth transitions (≈150–250ms)
- No nested menus
- No player-native UI visible
- No window borders, context menus, or debug overlays

---

## Scope – v0.1 (Locked)

### Included
- Electron launcher
- Static home screen with tiles
- Jellyfin integration
- MPV playback
- VLC playback
- Playback overlay (timeline + actions)
- Audio & subtitle list selection
- Remote-style navigation only

### Explicitly Excluded
- Android frontend
- Steam / games
- User profiles
- Settings UI
- Theming system
- Auto-start / login integration

---

## Development Decisions

- Electron **owns UI, focus, and navigation**
- MPV/VLC **owns playback only**
- Communication via IPC
- Jellyfin is authoritative for progress and state

---

## Long-Term Direction (Not Implemented Yet)

- Android device will use **native Jellyfin client**
- Linux frontend may remain custom
- Visual polish and animations are Phase 2
