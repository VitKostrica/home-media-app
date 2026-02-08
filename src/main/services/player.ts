import { spawn, ChildProcess } from 'child_process'
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
    jellyfinItemId?: string
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
            // VLC
            args = ['--fullscreen']
            if (startPosition && startPosition > 0) {
                args.push(`--start-time=${startPosition}`)
            }
            args.push(filePath)
            currentPlayer = spawn('vlc', args, { detached: true, stdio: 'ignore' })
        }

        // Report playback start to Jellyfin
        if (currentItemId) {
            const positionTicks = (startPosition || 0) * 10000000
            jellyfinService.reportPlaybackStart(currentItemId, positionTicks).catch(() => {})
        }

        currentPlayer.on('error', (err) => {
            console.error(`Failed to launch ${type}:`, err.message)
            currentPlayer = null
        })

        currentPlayer.on('exit', (code) => {
            console.log(`${type} exited with code ${code}`)

            // Report playback stopped to Jellyfin
            // Note: Without player IPC, we can't know the exact final position.
            // For now, report the start position. Real tracking via MPV IPC comes later.
            if (currentItemId) {
                const positionTicks = (startPosition || 0) * 10000000
                jellyfinService.reportStopped(currentItemId, positionTicks).catch(() => {})
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
