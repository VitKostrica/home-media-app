import { spawn, ChildProcess } from 'child_process'
import { BrowserWindow } from 'electron'
import fs from 'fs'
import * as jellyfinService from './jellyfin'
import net from 'net'
import os from 'os'
import path from 'path'

type PlayerType = 'mpv' | 'vlc'

let currentPlayer: ChildProcess | null = null
let currentItemId: string | null = null
let progressInterval: NodeJS.Timeout | null = null
let playbackStartedAtMs = 0
let playbackStartPositionSec = 0
let currentDurationSec = 0
let stopRequestedByUser = false
let currentPlaySessionId = ''
let lastKnownPositionSec = 0
let currentPlayerType: PlayerType | null = null
let hasVlcLivePosition = false
let vlcOutputBuffer = ''
let currentVlcRcSocket: net.Socket | null = null
let currentVlcRcSocketPath = ''
const COMPLETE_THRESHOLD_RATIO = 0.9
const FORCED_STOP_CAP_RATIO = 0.85

function ticksToSec(ticks: number): number {
    return Math.floor(ticks / 10000000)
}

function clearProgressInterval() {
    if (progressInterval) {
        clearInterval(progressInterval)
        progressInterval = null
    }
}

function clearVlcRcSocket() {
    if (currentVlcRcSocket) {
        currentVlcRcSocket.destroy()
        currentVlcRcSocket = null
    }
    if (currentVlcRcSocketPath) {
        try {
            fs.rmSync(currentVlcRcSocketPath, { force: true })
        } catch {
            // Ignore cleanup errors for the temporary VLC socket path.
        }
        currentVlcRcSocketPath = ''
    }
}

function resetPlaybackState() {
    clearVlcRcSocket()
    currentPlayer = null
    currentItemId = null
    playbackStartedAtMs = 0
    playbackStartPositionSec = 0
    currentDurationSec = 0
    stopRequestedByUser = false
    currentPlaySessionId = ''
    lastKnownPositionSec = 0
    currentPlayerType = null
    hasVlcLivePosition = false
    vlcOutputBuffer = ''
}

function updateLivePosition(positionSec: number) {
    if (!Number.isFinite(positionSec) || positionSec < 0) {
        return
    }

    lastKnownPositionSec = Math.floor(positionSec)
    hasVlcLivePosition = true
}

function consumePlayerOutput(chunk: string) {
    vlcOutputBuffer += chunk
    const lines = vlcOutputBuffer.split(/\r?\n/)
    vlcOutputBuffer = lines.pop() || ''

    for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) {
            continue
        }

        const timeMatch = line.match(/time:\s*(\d+(?:\.\d+)?)s/i)
        if (timeMatch?.[1]) {
            updateLivePosition(Number(timeMatch[1]))
            continue
        }

        const secondsMatch = line.match(/^\s*(\d+(?:\.\d+)?)\s*$/)
        if (secondsMatch?.[1]) {
            updateLivePosition(Number(secondsMatch[1]))
        }
    }
}

function connectToVlcRcSocket(socketPath: string, launchedPlayer: ChildProcess, attempt = 0) {
    if (currentPlayer !== launchedPlayer || !socketPath) {
        return
    }

    const socket = net.createConnection({ path: socketPath })

    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
        if (currentPlayer === launchedPlayer) {
            consumePlayerOutput(chunk)
        }
    })
    socket.on('connect', () => {
        if (currentPlayer !== launchedPlayer) {
            socket.destroy()
            return
        }
        currentVlcRcSocket = socket
    })
    socket.on('error', (err) => {
        socket.destroy()
        if (currentPlayer !== launchedPlayer) {
            return
        }

        if (attempt < 20) {
            setTimeout(() => connectToVlcRcSocket(socketPath, launchedPlayer, attempt + 1), 100)
            return
        }

        console.warn('[PlaybackDebug] Failed to connect to VLC RC socket:', err?.message || err)
    })
    socket.on('close', () => {
        if (currentVlcRcSocket === socket) {
            currentVlcRcSocket = null
        }
    })
}

function getEstimatedPositionTicks(): number {
    if (!playbackStartedAtMs) {
        return playbackStartPositionSec * 10000000
    }
    const elapsedSec = Math.max(0, Math.floor((Date.now() - playbackStartedAtMs) / 1000))
    return (playbackStartPositionSec + elapsedSec) * 10000000
}

function getBestKnownPositionTicks(): number {
    if (currentPlayerType === 'vlc' && hasVlcLivePosition) {
        return lastKnownPositionSec * 10000000
    }

    const estimatedSec = Math.floor(getEstimatedPositionTicks() / 10000000)
    const bestSec = Math.max(estimatedSec, lastKnownPositionSec)
    return bestSec * 10000000
}

function getReportedStopPositionTicks(): number {
    const estimatedTicks = getBestKnownPositionTicks()
    if (!stopRequestedByUser || currentDurationSec <= 0) {
        return estimatedTicks
    }

    const durationTicks = currentDurationSec * 10000000
    const completionThresholdTicks = Math.floor(durationTicks * COMPLETE_THRESHOLD_RATIO)
    if (estimatedTicks >= completionThresholdTicks) {
        return estimatedTicks
    }

    // When the user force-stops VLC in the middle of an episode, keep the
    // reported position safely below the completion threshold so Jellyfin
    // preserves resume state instead of marking the item played.
    const maxForcedStopTicks = Math.floor(durationTicks * FORCED_STOP_CAP_RATIO)
    return Math.min(estimatedTicks, maxForcedStopTicks)
}

function didFinishPlayback(positionTicks: number): boolean {
    if (currentDurationSec <= 0) {
        return false
    }
    const durationTicks = currentDurationSec * 10000000
    return positionTicks >= Math.floor(durationTicks * COMPLETE_THRESHOLD_RATIO)
}

async function refreshVlcPositionIfPossible(): Promise<void> {
    // VLC position is updated from the player output stream when RC reporting is available.
    // Keep this hook for the periodic reporter and future player integrations.
    return
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
    clearVlcRcSocket()

    // Kill existing player if running
    if (currentPlayer && !currentPlayer.killed) {
        clearProgressInterval()
        currentPlayer.kill()
        currentPlayer = null
    }

    currentPlayerType = type
    currentItemId = jellyfinItemId || null
    stopRequestedByUser = false
    currentDurationSec = durationSec && durationSec > 0 ? durationSec : 0
    currentPlaySessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    lastKnownPositionSec = startPosition && startPosition > 0 ? startPosition : 0
    hasVlcLivePosition = false
    vlcOutputBuffer = ''
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
            // VLC - enable the remote control interface and emit position updates
            // so we can track pause/resume state without wall-clock drift.
            // Use a local Unix socket so RC mode does not depend on stdin/tty state.
            currentVlcRcSocketPath = path.join(
                os.tmpdir(),
                `home-media-app-vlc-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sock`
            )
            try {
                fs.rmSync(currentVlcRcSocketPath, { force: true })
            } catch {
                // Ignore cleanup errors before reusing the socket path.
            }

            args = [
                '--fullscreen',
                '--extraintf=rc',
                `--rc-unix=${currentVlcRcSocketPath}`,
                '--rc-show-pos',
            ]
            if (startPosition && startPosition > 0) {
                args.push(`--start-time=${startPosition}`)
            }
            args.push(filePath)
            currentPlayer = spawn('vlc', args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
        }
        const launchedPlayer = currentPlayer

        if (type === 'vlc' && currentPlayer) {
            if (currentVlcRcSocketPath) {
                connectToVlcRcSocket(currentVlcRcSocketPath, launchedPlayer)
            }
            currentPlayer.stdout?.on('data', (chunk: Buffer) => {
                consumePlayerOutput(chunk.toString('utf8'))
            })
            currentPlayer.stderr?.on('data', (chunk: Buffer) => {
                consumePlayerOutput(chunk.toString('utf8'))
            })
        }

        // Push VLC window to the front on Linux
        if (mainWindow && process.platform === 'linux') {
            // Strategy: Minimize main app and create a small control bar
            // This makes VLC visible and controllable while keeping backspace available

            setTimeout(() => {
                try {
                    if (!currentPlayer || currentPlayer !== launchedPlayer) {
                        return
                    }
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
            resetPlaybackState()
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

            const itemId = currentItemId
            const playSessionId = currentPlaySessionId
            const estimatedTicks = getBestKnownPositionTicks()
            const positionTicks = getReportedStopPositionTicks()
            const markPlayed = didFinishPlayback(positionTicks)

            console.log(
                `[PlaybackDebug] reportStopped item=${itemId || 'none'} code=${code} stopRequested=${stopRequestedByUser} startSec=${playbackStartPositionSec} lastKnownSec=${lastKnownPositionSec} estimatedSec=${ticksToSec(estimatedTicks)} reportedSec=${ticksToSec(positionTicks)} durationSec=${currentDurationSec || 0} markPlayed=${markPlayed}`
            )

            void (async () => {
                try {
                    if (itemId) {
                        await jellyfinService.reportStopped(itemId, positionTicks, playSessionId, { markPlayed })
                    } else {
                        console.warn('[PlaybackDebug] Skipping reportStopped because item id is missing')
                    }
                } catch (err) {
                    console.error('[PlaybackDebug] reportStopped failed:', (err as any)?.message || err)
                } finally {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('player:stopped')
                    }
                }
            })()

            // Restore Electron window when player closes
            if (mainWindow && mainWindow.isMinimized()) {
                mainWindow.restore()
                mainWindow.focus()
            }
            if (mainWindow) {
                mainWindow.setAlwaysOnTop(true) // Re-enable always-on-top
            }

            resetPlaybackState()
        })

        // Unref so the player doesn't prevent Electron from closing
        currentPlayer.unref()

        return { success: true }
    } catch (err: any) {
        clearVlcRcSocket()
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
