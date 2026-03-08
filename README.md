# Home Media Center

A custom TV-like media center running on Linux, controlled entirely via remote-style inputs (arrows / OK / Back).

## Features

- **Fullscreen kiosk mode** – No desktop UI, TV-like interface
- **Remote control** – Arrow keys, OK/Enter, Back buttons only
- **Jellyfin integration** – Track watch progress, manage media library
- **Dual player support** – MPV and VLC for optimal playback
- **Multi-device sync** – Jellyfin backend for future Android support

## Architecture

- **Frontend**: Electron + React + TypeScript
- **Backend**: Jellyfin media server
- **Players**: MPV and VLC via IPC

## Getting Started

### Prerequisites
- Node.js 16+
- npm or yarn
- Linux (tested on Ubuntu)

### Installation

```bash
npm install
```

### Development

```bash
npm start
```

This will start the Vite dev server and Electron in development mode.

### Build

```bash
npm run build
npm run electron
```

## Project Structure

```
src/
├── main/           # Electron main process
│   ├── main.ts
│   └── preload.ts
├── renderer/       # React UI
│   ├── App.tsx
│   ├── components/
│   ├── screens/
│   ├── hooks/
│   └── main.tsx
├── services/       # API clients
├── types/          # TypeScript definitions
public/            # Static assets
```

## Controls

- **Arrow Keys** – Navigate, seek
- **OK/Enter** – Confirm, play/pause
- **Back** – Go back, exit

### Custom Key Bindings

You can add alternative keys for remote/airmouse buttons in the app config file:

- Linux path: `~/.config/home-media-app/config.json`

Example:

```json
{
  "moviesBasePath": "/mnt/media/Movies",
  "showsBasePath": "/mnt/media/Shows",
  "keybindings": {
    "confirm": ["NumpadEnter", "MediaPlayPause"],
    "back": ["BrowserBack", "GoBack"]
  }
}
```

Default keys always stay active; configured keys are treated as additional alternatives.

If `moviesBasePath` / `showsBasePath` are set, the app will try to remap Jellyfin-reported file paths to those local folders for playback.

## For More Details

See [VISION.MD](./VISION.MD) for the complete product vision and specification.
