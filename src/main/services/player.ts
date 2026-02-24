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

        // Minimize or hide Electron window to bring VLC to front
        // This ensures the fullscreen player is visible
        if (mainWindow && process.platform === 'linux') {
            // Immediately minimize the Electron window to clear it from screen
            try {
                mainWindow.minimize()
            } catch (err) {
                console.warn('Failed to minimize window:', err)
            }

            // After a delay to let VLC fully start, use xdotool to ensure it's focused
            setTimeout(() => {
                try {
                    // Use xdotool to raise VLC window on Linux
                    // First, minimize Electron window again just to be sure
                    if (mainWindow && !mainWindow.isMinimized()) {
                        mainWindow.minimize()
                    }

                    // Search for VLC by window name and activate it
                    const xdotool = spawn('bash', [
                        '-c',
                        'xdotool search --class "vlc" windowactivate --sync 2>/dev/null || xdotool search --name "vlc" windowactivate 2>/dev/null || true',
                    ], {
                        detached: true,
                        stdio: 'ignore',
                    })
                    xdotool.unref()

                    console.log('VLC window activation command sent')
                } catch (err) {
                    console.warn('Failed to focus VLC with xdotool:', err)
                }
            }, 800) // Wait 800ms for VLC to fully start and open
        }

        // Report playback start to Jellyfin
        if (currentItemId) {
            const positionTicks = (startPosition || 0) * 10000000
            jellyfinService.reportPlaybackStart(currentItemId, positionTicks).catch(() => { })
        }

        currentPlayer.on('error', (err) => {
            console.error(`Failed to launch ${type}:`, err.message)
            currentPlayer = null
            // Restore Electron window if player failed
            if (mainWindow && mainWindow.isMinimized()) {
                mainWindow.restore()
                mainWindow.focus()
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
