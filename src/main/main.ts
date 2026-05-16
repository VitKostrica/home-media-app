import { app, BrowserWindow, ipcMain, globalShortcut, protocol } from 'electron'
import path from 'path'
import * as fs from 'fs'
import { URL } from 'url'
import * as configService from './services/config'
import * as jellyfinService from './services/jellyfin'
import * as playerService from './services/player'

const isDev = process.env.NODE_ENV === 'development'

// Linux GPU drivers can fail Chromium context creation in kiosk-like Electron apps.
// Fall back to software rendering to keep app startup stable.
if (process.platform === 'linux') {
    app.disableHardwareAcceleration()
}

let mainWindow: BrowserWindow | null = null

function toGlobalShortcutAccelerator(key: string): string | null {
    const normalized = key.trim().toLowerCase()
    if (!normalized) {
        return null
    }

    if (normalized === 'backspace') {
        return 'BackSpace'
    }
    if (normalized === 'escape' || normalized === 'esc') {
        return 'Escape'
    }

    // Electron does not support BrowserBack as a globalShortcut accelerator.
    // Keep it for renderer-side matching, but do not try to register it globally.
    if (normalized === 'browserback') {
        return null
    }

    return key.trim()
}

function registerBackShortcuts() {
    for (const accelerator of ['BackSpace']) {
        globalShortcut.unregister(accelerator)
    }

    const config = configService.getConfig()
    const backKeys = new Set<string>([...config.keybindings.back, 'BackSpace', 'BrowserBack'])

    for (const key of backKeys) {
        const accelerator = toGlobalShortcutAccelerator(key)
        if (!accelerator) {
            if (key.trim().toLowerCase() === 'browserback') {
                console.warn(
                    'BrowserBack is not supported as a global shortcut accelerator in Electron. ' +
                        'Use Backspace, Escape, or another supported key for VLC control.'
                )
            }
            continue
        }

        try {
            const registered = globalShortcut.register(accelerator, () => {
                console.log(`${accelerator} pressed - stopping player`)
                playerService.stopPlayer()

                if (mainWindow && mainWindow.isMinimized()) {
                    mainWindow.restore()
                    mainWindow.focus()
                }
            })

            if (!registered) {
                console.warn(`Failed to register global shortcut: ${accelerator}`)
            }
        } catch (err) {
            console.warn(`Failed to register global shortcut ${accelerator}:`, (err as Error)?.message || err)
        }
    }
}

// Register custom protocol handler for local media files
function registerLocalProtocol() {
    protocol.registerFileProtocol('local', (request, callback) => {
        // Convert local://path/to/file to /path/to/file
        const url = new URL(request.url)
        let filePath = url.pathname

        // Decode URL-encoded characters (spaces, diacritics, etc.)
        // Example: %C5%AF (ů), %20 (space), etc.
        filePath = decodeURIComponent(filePath)

        console.log('Local protocol request (decoded):', filePath)

        // Check if file exists before trying to serve it
        if (fs.existsSync(filePath)) {
            console.log('Local file found, serving:', filePath)
            callback({ path: filePath })
        } else {
            console.warn('File not found:', filePath)
            callback({ error: -6 }) // NET_ERROR(FILE_NOT_FOUND)
        }
    })
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1920,
        height: 1080,
        fullscreen: false,
        frame: false, // Borderless window
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webviewTag: true,
        },
        show: false,
    })

    // Configure for kiosk mode
    mainWindow.setMenu(null)
    mainWindow.setAlwaysOnTop(true)
    mainWindow.maximize() // Maximize instead of fullscreen for alt+tab ability

    const startUrl = isDev
        ? 'http://localhost:3000'
        : `file://${path.join(__dirname, '../renderer/index.html')}`

    mainWindow.loadURL(startUrl)
    mainWindow.show()

    if (isDev) {
        mainWindow.webContents.openDevTools()
    }

    // Register global back shortcuts so the same action works from VLC and the app.
    registerBackShortcuts()

    mainWindow.on('closed', () => {
        mainWindow = null
        // Unregister shortcuts when window closes
        globalShortcut.unregisterAll()
    })
}

// Register protocol before app is ready
app.on('ready', () => {
    registerLocalProtocol()
    createWindow()
})

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

ipcMain.handle('app:restart', () => {
    try {
        playerService.stopPlayer()
    } catch {
        // Ignore player stop errors during restart
    }
    app.relaunch()
    app.exit(0)
})

// ── Config IPC ───────────────────────────────────────────────

ipcMain.handle('config:get', () => {
    return configService.getConfig()
})

ipcMain.handle('config:set', (_, partial: Record<string, any>) => {
    configService.setConfig(partial)
    registerBackShortcuts()
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

ipcMain.handle('jellyfin:get-item-details', async (_, itemId: string) => {
    return await jellyfinService.getItemDetails(itemId)
})

ipcMain.handle('jellyfin:get-resume-items', async () => {
    return await jellyfinService.getResumeItems()
})

ipcMain.handle('jellyfin:get-next-up-items', async () => {
    return await jellyfinService.getNextUpItems()
})

ipcMain.handle('jellyfin:get-latest-items', async () => {
    return await jellyfinService.getLatestItems()
})

ipcMain.handle('jellyfin:get-playback-info', async (_, itemId: string) => {
    console.log('[IPC] jellyfin:get-playback-info called with itemId:', itemId)
    const result = await jellyfinService.getPlaybackInfo(itemId)
    console.log('[IPC] jellyfin:get-playback-info result:', result)
    return result
})

ipcMain.handle('jellyfin:report-playback-start', async (_, itemId: string, positionTicks: number) => {
    await jellyfinService.reportPlaybackStart(itemId, positionTicks)
})

ipcMain.handle('jellyfin:report-progress', async (_, itemId: string, positionTicks: number, isPaused?: boolean) => {
    await jellyfinService.reportProgress(itemId, positionTicks, undefined, isPaused)
})

ipcMain.handle('jellyfin:report-stopped', async (_, itemId: string, positionTicks: number) => {
    await jellyfinService.reportStopped(itemId, positionTicks)
})

ipcMain.handle('jellyfin:mark-played', async (_, itemId: string) => {
    await jellyfinService.markItemPlayed(itemId)
})

ipcMain.handle('jellyfin:mark-unplayed', async (_, itemId: string) => {
    await jellyfinService.markItemUnplayed(itemId)
})

// ── Player IPC ───────────────────────────────────────────────

ipcMain.handle('player:launch', (_, type: string, filePath: string, startPosition?: number, jellyfinItemId?: string, durationSec?: number) => {
    return playerService.launchPlayer(type as 'mpv' | 'vlc', filePath, startPosition, jellyfinItemId, mainWindow || undefined, durationSec)
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

// ── File IPC ─────────────────────────────────────────────────

ipcMain.handle('file:get-local-image', async (_, itemId: string) => {
    const config = configService.getConfig()
    const metadataRoots = [
        config.mediaBasePath ? path.join(config.mediaBasePath, 'metadata') : '',
        config.moviesBasePath ? path.join(config.moviesBasePath, 'metadata') : '',
        config.showsBasePath ? path.join(config.showsBasePath, 'metadata') : '',
        '/var/lib/jellyfin/metadata',
    ].filter(Boolean)

    const imageNames = ['poster.jpg', 'thumb.jpg', 'landscape.jpg', 'folder.jpg', 'primary.jpg']

    for (const root of metadataRoots) {
        const candidateDirs = [
            path.join(root, itemId),
            path.join(root, 'metadata', itemId),
            path.join(root, itemId, 'metadata'),
        ]

        for (const candidateDir of candidateDirs) {
            for (const imageName of imageNames) {
                const imagePath = path.join(candidateDir, imageName)
                try {
                    if (fs.existsSync(imagePath)) {
                        return imagePath
                    }
                } catch (err) {
                    console.error('Error checking image path:', imagePath, err)
                }
            }
        }
    }

    return null
})
