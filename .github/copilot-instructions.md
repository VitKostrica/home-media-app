# Home Media Center - Development Guide

## Project Overview
A custom TV-like media center for Linux running in fullscreen kiosk mode. Built with Electron + React + TypeScript. Remote-controlled via arrow keys, OK/Enter, and Back. Integrates with Jellyfin for media tracking and supports MPV/VLC players.

See VISION.MD for full specification.

## Architecture
- **Main Process**: Electron app, manages window, IPC, player processes
- **Renderer**: React + TypeScript, handles UI and remote navigation
- **Players**: MPV and VLC via IPC communication
- **Backend**: Jellyfin API for media library and progress tracking

## Development Checklist
- [x] Create copilot-instructions.md
- [ ] Get project setup info
- [ ] Scaffold project structure
- [ ] Install dependencies
- [ ] Configure Electron main process
- [ ] Setup React TypeScript renderer
- [ ] Create initial project structure
- [ ] Verify project compiles

## Key Commands
- `npm install` - Install dependencies
- `npm start` - Run development server
- `npm run build` - Build for production
- `npm run electron` - Run Electron in dev mode

## Project Structure
```
src/
  main/
    main.ts           - Electron main process
    preload.ts        - Preload script for IPC
  renderer/
    App.tsx           - Main React component
    components/       - Reusable UI components
    screens/          - Full-screen views
    hooks/            - Custom React hooks
    services/
      jellyfin.ts     - Jellyfin API client
      player.ts       - Player IPC communication
  types/
    index.ts          - Shared TypeScript types
public/
  - Static assets

## IPC Channels
- player:play
- player:pause
- player:stop
- player:seek
- player:audio-select
- player:subtitle-select
- jellyfin:get-media
- jellyfin:update-progress

## Linux Kiosk Mode
- Fullscreen, no borders
- No keyboard shortcuts except defined remote inputs
- Always-on-top window
- Auto-hide cursor after inactivity

## Next Steps
1. Verify project scaffolding
2. Install all dependencies
3. Set up Electron configuration
4. Create home screen UI
