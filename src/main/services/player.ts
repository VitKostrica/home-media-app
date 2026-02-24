import { spawn, ChildProcess } from 'child_process'
import { BrowserWindow } from 'electron'
import * as jellyfinService from './jellyfin'

type PlayerType = 'mpv' | 'vlc'

let currentPlayer: ChildProcess | null = null
let currentItemId: string | null = null

/**
 * Launch MPV or VLC with a media file.
 * Optionally starts from a specific position (in seconds).
 */
export function launchPlayer(
    type: PlayerType,
    filePath: string,
    startPosition?: number,
    jellyfinItemId?: string,
    mainWindow?: BrowserWindow
): { success: boolean; error?: string } {
    // Kill existing player if running
    if (currentPlayer && !currentPlayer.killed) {
        currentPlayer.kill()
        currentPlayer = null
    }

    currentItemId = jellyfinItemId || null

    try {
        let args: string[]

        if (type === 'mpv') {
            args = ['--fullscreen']
            if (startPosition && startPosition > 0) {
                args.push(`--start=+${startPosition}`)
            }
            args.push(filePath)
            currentPlayer = spawn('mpv', args, { detached: true, stdio: 'ignore' })
        } else {
            // VLC - add maximized window options
            args = ['--fullscreen', '--quiet']
            if (startPosition && startPosition > 0) {
                args.push(`--start-time=${startPosition}`)
            }
            args.push(filePath)
            currentPlayer = spawn('vlc', args, { detached: true, stdio: 'ignore' })
        }

        // Push VLC window to the front on Linux
        if (mainWindow && process.platform === 'linux') {
            // Strategy: Minimize main app and create a small control bar
            // This makes VLC visible and controllable while keeping backspace available

            setTimeout(() => {
                try {
                    console.log('Minimizing app and pushing VLC to front...')

                    // Minimize the main Electron window to get it out of the way
                    if (mainWindow) {
                        try {
                            mainWindow.setAlwaysOnTop(false) // Temporarily disable always-on-top
                            mainWindow.minimize()
                        } catch (err) {
                            console.warn('Failed to minimize window:', err)
                        }
                    }

                    // Push VLC to front using multiple methods
                    const focusCommands = [
                        // Try wmctrl first (most reliable)
                        'wmctrl -a "VLC" 2>/dev/null',
                        // Try xdotool with window class
                        'xdotool search --class "vlc" windowactivate --sync windowraise 2>/dev/null',
                        // Try xdotool with window name
                        'xdotool search --name "vlc" windowactivate --sync windowraise 2>/dev/null',
                    ]

                    const command = focusCommands.join(' || ')
                    const xdotool = spawn('bash', ['-c', command], {
                        detached: true,
                        stdio: 'ignore',
                    })
                    xdotool.unref()

                    console.log('VLC focus commands executed')
                } catch (err) {
                    console.warn('Failed to push VLC to front:', err)
                }
            }, 600) // Wait 600ms for VLC to fully initialize
        }

        // Report playback start to Jellyfin
        if (currentItemId) {
            const positionTicks = (startPosition || 0) * 10000000
            jellyfinService.reportPlaybackStart(currentItemId, positionTicks).catch(() => { })
        }

        currentPlayer.on('error', (err) => {
            console.error(`Failed to launch ${type}:`, err.message)
            currentPlayer = null
            // Restore Electron window if player failed to start
            if (mainWindow && mainWindow.isMinimized()) {
                mainWindow.restore()
                mainWindow.focus()
                mainWindow.setAlwaysOnTop(true) // Re-enable always-on-top
            }
        })

        currentPlayer.on('exit', (code) => {
            console.log(`${type} exited with code ${code}`)

            // Report playback stopped to Jellyfin
            // Note: Without player IPC, we can't know the exact final position.
            // For now, report the start position. Real tracking via MPV IPC comes later.
            if (currentItemId) {
                const positionTicks = (startPosition || 0) * 10000000
                jellyfinService.reportStopped(currentItemId, positionTicks).catch(() => { })
            }

            // Restore Electron window when player closes
            if (mainWindow && mainWindow.isMinimized()) {
                mainWindow.restore()
                mainWindow.focus()
            }
            if (mainWindow) {
                mainWindow.setAlwaysOnTop(true) // Re-enable always-on-top
            }

            currentPlayer = null
            currentItemId = null
        })

        // Unref so the player doesn't prevent Electron from closing
        currentPlayer.unref()

        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message || `Failed to launch ${type}` }
    }
}

/** Kill the current player process if running */
export function stopPlayer(): void {
    if (currentPlayer && !currentPlayer.killed) {
        currentPlayer.kill()
        currentPlayer = null
        currentItemId = null
    }
}
