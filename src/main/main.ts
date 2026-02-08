import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import * as configService from './services/config'
import * as jellyfinService from './services/jellyfin'
import * as playerService from './services/player'

const isDev = process.env.NODE_ENV === 'development'

let mainWindow: BrowserWindow | null = null

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1920,
        height: 1080,
        fullscreen: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
        show: false,
    })

    // Configure for kiosk mode
    mainWindow.setMenu(null)
    mainWindow.setAlwaysOnTop(true)

    const startUrl = isDev
        ? 'http://localhost:3000'
        : `file://${path.join(__dirname, '../renderer/index.html')}`

    mainWindow.loadURL(startUrl)
    mainWindow.show()

    if (isDev) {
        mainWindow.webContents.openDevTools()
    }

    mainWindow.on('closed', () => {
        mainWindow = null
    })
}

app.on('ready', createWindow)

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow()
    }
})

// ── App IPC ──────────────────────────────────────────────────

ipcMain.handle('app:close', () => {
    if (mainWindow) {
        mainWindow.close()
    }
})

// ── Config IPC ───────────────────────────────────────────────

ipcMain.handle('config:get', () => {
    return configService.getConfig()
})

ipcMain.handle('config:set', (_, partial: Record<string, any>) => {
    configService.setConfig(partial)
})

// ── Jellyfin IPC ─────────────────────────────────────────────

ipcMain.handle('jellyfin:authenticate', async (_, username: string, password: string) => {
    return await jellyfinService.authenticate(username, password)
})

ipcMain.handle('jellyfin:get-movies', async () => {
    return await jellyfinService.getMovies()
})

ipcMain.handle('jellyfin:get-series', async () => {
    return await jellyfinService.getSeries()
})

ipcMain.handle('jellyfin:get-seasons', async (_, seriesId: string) => {
    return await jellyfinService.getSeasons(seriesId)
})

ipcMain.handle('jellyfin:get-episodes', async (_, seriesId: string, seasonId: string) => {
    return await jellyfinService.getEpisodes(seriesId, seasonId)
})

ipcMain.handle('jellyfin:report-progress', async (_, itemId: string, positionTicks: number) => {
    await jellyfinService.reportProgress(itemId, positionTicks)
})

ipcMain.handle('jellyfin:report-stopped', async (_, itemId: string, positionTicks: number) => {
    await jellyfinService.reportStopped(itemId, positionTicks)
})

// ── Player IPC ───────────────────────────────────────────────

ipcMain.handle('player:launch', (_, type: string, filePath: string, startPosition?: number, jellyfinItemId?: string) => {
    return playerService.launchPlayer(type as 'mpv' | 'vlc', filePath, startPosition, jellyfinItemId)
})

ipcMain.handle('player:stop', () => {
    playerService.stopPlayer()
})

ipcMain.handle('player:play', () => {
    // TODO: MPV/VLC IPC control (Phase 2)
})

ipcMain.handle('player:pause', () => {
    // TODO: MPV/VLC IPC control (Phase 2)
})

ipcMain.handle('player:seek', (_, _position: number) => {
    // TODO: MPV/VLC IPC control (Phase 2)
})

ipcMain.handle('player:audio-select', (_, _index: number) => {
    // TODO: MPV/VLC IPC control (Phase 2)
})

ipcMain.handle('player:subtitle-select', (_, _index: number) => {
    // TODO: MPV/VLC IPC control (Phase 2)
})
