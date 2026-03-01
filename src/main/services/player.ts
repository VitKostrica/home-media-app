import { spawn, ChildProcess } from 'child_process'
import { BrowserWindow } from 'electron'
import * as jellyfinService from './jellyfin'
import path from 'path'
import * as fs from 'fs'
import net from 'net'

type PlayerType = 'mpv' | 'vlc'

let currentPlayer: ChildProcess | null = null
let currentItemId: string | null = null
let progressInterval: NodeJS.Timeout | null = null
let playbackStartedAtMs = 0
let playbackStartPositionSec = 0
let currentDurationSec = 0
let stopRequestedByUser = false
let currentPlaySessionId = ''
let currentVlcSocketPath = ''
let lastKnownPositionSec = 0

function ticksToSec(ticks: number): number {
    return Math.floor(ticks / 10000000)
}

function clearProgressInterval() {
    if (progressInterval) {
        clearInterval(progressInterval)
        progressInterval = null
    }
}

function getEstimatedPositionTicks(): number {
    if (!playbackStartedAtMs) {
        return playbackStartPositionSec * 10000000
    }
    const elapsedSec = Math.max(0, Math.floor((Date.now() - playbackStartedAtMs) / 1000))
    return (playbackStartPositionSec + elapsedSec) * 10000000
}

function getBestKnownPositionTicks(): number {
    const estimatedSec = Math.floor(getEstimatedPositionTicks() / 10000000)
    const bestSec = Math.max(estimatedSec, lastKnownPositionSec)
    return bestSec * 10000000
}

function getReportedStopPositionTicks(): number {
    const estimatedTicks = getBestKnownPositionTicks()
    if (!stopRequestedByUser || currentDurationSec <= 0) {
        return estimatedTicks
    }

    // When user force-stops VLC (Backspace), avoid accidental "fully watched"
    // due to estimate drift; keep reported stop safely below completion.
    const durationTicks = currentDurationSec * 10000000
    const maxForcedStopTicks = Math.floor(durationTicks * 0.9)
    return Math.min(estimatedTicks, maxForcedStopTicks)
}

async function queryVlcTimeSec(socketPath: string): Promise<number | null> {
    if (!socketPath) return null
    if (!fs.existsSync(socketPath)) return null

    return new Promise((resolve) => {
        let settled = false
        let output = ''

        const finish = (value: number | null) => {
            if (settled) return
            settled = true
            resolve(value)
        }

        const socket = net.createConnection(socketPath)

        const guard = setTimeout(() => {
            socket.destroy()
            finish(null)
        }, 800)

        socket.on('connect', () => {
            socket.write('get_time\n')
            setTimeout(() => {
                socket.end()
            }, 120)
        })

        socket.on('data', (chunk: Buffer) => {
            output += chunk.toString('utf8')
        })

        socket.on('error', () => {
            clearTimeout(guard)
            finish(null)
        })

        socket.on('close', () => {
            clearTimeout(guard)
            const lines = output
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
            for (const line of lines.reverse()) {
                if (/^\d+$/.test(line)) {
                    const sec = parseInt(line, 10)
                    finish(Number.isFinite(sec) ? sec : null)
                    return
                }
            }
            finish(null)
        })
    })
}

async function refreshVlcPositionIfPossible(): Promise<void> {
    if (!currentVlcSocketPath) return
    const sec = await queryVlcTimeSec(currentVlcSocketPath)
    if (typeof sec === 'number' && sec >= 0) {
        lastKnownPositionSec = sec
        console.log(`[PlaybackDebug] VLC reported current sec=${sec} via rc socket`)
    }
}

function startProgressReporting(itemId: string) {
    clearProgressInterval()
    progressInterval = setInterval(async () => {
        await refreshVlcPositionIfPossible()
        const ticks = getBestKnownPositionTicks()
        console.log(`[PlaybackDebug] Progress tick item=${itemId} sec=${ticksToSec(ticks)} ticks=${ticks}`)
        jellyfinService.reportProgress(itemId, ticks, currentPlaySessionId).catch((err) => {
            console.error('[PlaybackDebug] reportProgress failed:', err?.message || err)
        })
    }, 10000)
}

/**
 * Launch MPV or VLC with a media file.
 * Optionally starts from a specific position (in seconds).
 */
export function launchPlayer(
    type: PlayerType,
    filePath: string,
    startPosition?: number,
    jellyfinItemId?: string,
    mainWindow?: BrowserWindow,
    durationSec?: number
): { success: boolean; error?: string } {
    // Kill existing player if running
    if (currentPlayer && !currentPlayer.killed) {
        clearProgressInterval()
        currentPlayer.kill()
        currentPlayer = null
    }

    currentItemId = jellyfinItemId || null
    stopRequestedByUser = false
    currentDurationSec = durationSec && durationSec > 0 ? durationSec : 0
    currentPlaySessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    lastKnownPositionSec = startPosition && startPosition > 0 ? startPosition : 0
    currentVlcSocketPath = ''
    console.log(
        `[PlaybackDebug] Launch requested type=${type} item=${currentItemId || 'none'} playSessionId=${currentPlaySessionId} startSec=${startPosition || 0} durationSec=${currentDurationSec || 0} file=${path.basename(filePath)}`
    )

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
            const socketName = `home-media-vlc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sock`
            currentVlcSocketPath = path.join('/tmp', socketName)
            try {
                if (fs.existsSync(currentVlcSocketPath)) {
                    fs.unlinkSync(currentVlcSocketPath)
                }
            } catch {
                // ignore stale socket cleanup failure
            }
            args.push('--extraintf=rc', '--rc-fake-tty', `--rc-unix=${currentVlcSocketPath}`)
            if (startPosition && startPosition > 0) {
                args.push(`--start-time=${startPosition}`)
            }
            args.push(filePath)
            currentPlayer = spawn('vlc', args, { detached: true, stdio: 'ignore' })
        }
        const launchedPlayer = currentPlayer

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
        playbackStartPositionSec = startPosition && startPosition > 0 ? startPosition : 0
        playbackStartedAtMs = Date.now()
        if (currentItemId) {
            const positionTicks = playbackStartPositionSec * 10000000
            console.log(
                `[PlaybackDebug] reportPlaybackStart item=${currentItemId} sec=${playbackStartPositionSec} ticks=${positionTicks}`
            )
            jellyfinService.reportPlaybackStart(currentItemId, positionTicks, currentPlaySessionId).catch((err) => {
                console.error('[PlaybackDebug] reportPlaybackStart failed:', err?.message || err)
            })
            startProgressReporting(currentItemId)
        } else {
            console.warn('[PlaybackDebug] Missing jellyfin item id, progress/stopped will not be reported')
        }

        currentPlayer.on('error', (err) => {
            if (currentPlayer !== launchedPlayer) return
            console.error(`Failed to launch ${type}:`, err.message)
            clearProgressInterval()
            currentPlayer = null
            stopRequestedByUser = false
            currentDurationSec = 0
            currentPlaySessionId = ''
            currentVlcSocketPath = ''
            lastKnownPositionSec = 0
            // Restore Electron window if player failed to start
            if (mainWindow && mainWindow.isMinimized()) {
                mainWindow.restore()
                mainWindow.focus()
                mainWindow.setAlwaysOnTop(true) // Re-enable always-on-top
            }
        })

        currentPlayer.on('exit', (code) => {
            if (currentPlayer !== launchedPlayer) return
            console.log(`${type} exited with code ${code}`)
            clearProgressInterval()

            // Report playback stopped to Jellyfin
            if (currentItemId) {
                const estimatedTicks = getBestKnownPositionTicks()
                const positionTicks = getReportedStopPositionTicks()
                console.log(
                    `[PlaybackDebug] reportStopped item=${currentItemId} code=${code} stopRequested=${stopRequestedByUser} startSec=${playbackStartPositionSec} lastKnownSec=${lastKnownPositionSec} estimatedSec=${ticksToSec(estimatedTicks)} reportedSec=${ticksToSec(positionTicks)} durationSec=${currentDurationSec || 0}`
                )
                jellyfinService.reportStopped(currentItemId, positionTicks, currentPlaySessionId).catch((err) => {
                    console.error('[PlaybackDebug] reportStopped failed:', err?.message || err)
                })
            } else {
                console.warn('[PlaybackDebug] Skipping reportStopped because item id is missing')
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
            playbackStartedAtMs = 0
            playbackStartPositionSec = 0
            currentDurationSec = 0
            stopRequestedByUser = false
            currentPlaySessionId = ''
            currentVlcSocketPath = ''
            lastKnownPositionSec = 0
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
        stopRequestedByUser = true
        console.log(
            `[PlaybackDebug] stopPlayer called item=${currentItemId || 'none'} startSec=${playbackStartPositionSec} durationSec=${currentDurationSec || 0}`
        )
        refreshVlcPositionIfPossible()
            .catch(() => { })
            .finally(() => {
                currentPlayer?.kill()
            })
    }
}
