import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'

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

// IPC handlers
ipcMain.handle('player:play', () => {
    // TODO: Implement player communication
})

ipcMain.handle('jellyfin:get-library', async () => {
    // TODO: Implement Jellyfin API call
})
