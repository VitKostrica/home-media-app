import axios from 'axios'
import { spawn, ChildProcess } from 'child_process'
import { BrowserWindow } from 'electron'
import * as jellyfinService from './jellyfin'
import path from 'path'

type PlayerType = 'mpv' | 'vlc'
type VlcPlaybackState = 'playing' | 'paused' | 'stopped' | 'ended' | 'opening' | 'buffering' | string

interface VlcStatusResponse {
    time?: number
    state?: VlcPlaybackState
    length?: number
    position?: number
}

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
let currentVlcState: VlcPlaybackState = ''
let currentVlcHttpPort = 0
let currentVlcHttpPassword = ''
let vlcStatusPollInFlight = false

const COMPLETE_THRESHOLD_RATIO = 0.9
const FORCED_STOP_CAP_RATIO = 0.85
const PROGRESS_POLL_INTERVAL_MS = 1000

function ticksToSec(ticks: number): number {
    return Math.floor(ticks / 10000000)
}

function clearProgressInterval() {
    if (progressInterval) {
        clearInterval(progressInterval)
        progressInterval = null
    }
}

function clearVlcState() {
    currentVlcHttpPort = 0
    currentVlcHttpPassword = ''
    currentVlcState = ''
    vlcStatusPollInFlight = false
}

function resetPlaybackState() {
    clearVlcState()
    currentPlayer = null
    currentItemId = null
    playbackStartedAtMs = 0
    playbackStartPositionSec = 0
    currentDurationSec = 0
    stopRequestedByUser = false
    currentPlaySessionId = ''
    lastKnownPositionSec = 0
    currentPlayerType = null
}

function updateLivePosition(positionSec: number) {
    if (!Number.isFinite(positionSec) || positionSec < 0) {
        return
    }

    const normalized = Math.floor(positionSec)
    lastKnownPositionSec = Math.max(lastKnownPositionSec, normalized)
}

function extractVlcPositionSec(data: VlcStatusResponse): number | null {
    if (typeof data.time === 'number' && Number.isFinite(data.time) && data.time >= 0) {
        return Math.floor(data.time)
    }

    if (
        typeof data.position === 'number' &&
        Number.isFinite(data.position) &&
        typeof data.length === 'number' &&
        Number.isFinite(data.length) &&
        data.position >= 0 &&
        data.length > 0
    ) {
        return Math.floor(data.position * data.length)
    }

    return null
}

function getPlaybackElapsedMs(): number {
    if (!playbackStartedAtMs) {
        return 0
    }

    return Math.max(0, Date.now() - playbackStartedAtMs)
}

function reportCurrentPlaybackProgress(forcePausedOverride?: boolean) {
    if (!currentItemId) {
        return
    }

    const ticks = getBestKnownPositionTicks()
    console.log(
        `[PlaybackDebug] reportCurrentProgress item=${currentItemId} sec=${ticksToSec(ticks)} ticks=${ticks} paused=${forcePausedOverride === true}`
    )
    jellyfinService
        .reportProgress(currentItemId, ticks, currentPlaySessionId, forcePausedOverride === true)
        .catch((err) => {
            console.error('[PlaybackDebug] reportProgress failed:', err?.message || err)
        })
}

async function requestVlcStatusSnapshot(timeoutMs = 300): Promise<boolean> {
    if (currentPlayerType !== 'vlc' || !currentVlcHttpPort || !currentVlcHttpPassword || vlcStatusPollInFlight) {
        return false
    }

    vlcStatusPollInFlight = true
    try {
        const response = await axios.get(`http://127.0.0.1:${currentVlcHttpPort}/requests/status.json`, {
            auth: {
                username: '',
                password: currentVlcHttpPassword,
            },
            timeout: timeoutMs,
        })

        const data = response.data as VlcStatusResponse
        const positionSec = extractVlcPositionSec(data)
        if (positionSec !== null) {
            updateLivePosition(positionSec)
        }
        if (data.state) {
            currentVlcState = data.state
        }
        return true
    } catch (err) {
        if (currentPlayerType === 'vlc') {
            console.warn('[PlaybackDebug] VLC status snapshot failed:', (err as any)?.message || err)
        }
        return false
    } finally {
        vlcStatusPollInFlight = false
    }
}

function getEstimatedPositionTicks(): number {
    const elapsedMs = getPlaybackElapsedMs()
    if (!playbackStartedAtMs) {
        return playbackStartPositionSec * 10000000
    }
    const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000))
    return (playbackStartPositionSec + elapsedSec) * 10000000
}

function getBestKnownPositionTicks(): number {
    if (currentPlayerType === 'vlc') {
        return Math.max(0, lastKnownPositionSec) * 10000000
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
    if (currentPlayerType === 'vlc') {
        await requestVlcStatusSnapshot(300)
    }
}

function startProgressReporting() {
    clearProgressInterval()
    progressInterval = setInterval(async () => {
        await refreshVlcPositionIfPossible()

        const paused = currentPlayerType === 'vlc' && currentVlcState === 'paused'
        console.log(
            `[PlaybackDebug] progress tick item=${currentItemId || 'none'} elapsedMs=${getPlaybackElapsedMs()} liveSec=${ticksToSec(getBestKnownPositionTicks())} vlcState=${currentPlayerType === 'vlc' ? currentVlcState || 'unknown' : 'n/a'}`
        )
        reportCurrentPlaybackProgress(paused)
    }, PROGRESS_POLL_INTERVAL_MS)
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
    clearVlcState()

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
    currentVlcState = ''
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
            // VLC - use the HTTP interface so we can poll the current time and
            // playback state directly instead of estimating with wall-clock drift.
            currentVlcHttpPort = 4200 + Math.floor(Math.random() * 2000)
            currentVlcHttpPassword = Math.random().toString(36).slice(2, 12)

            args = [
                '--fullscreen',
                '--extraintf=http',
                '--http-host=127.0.0.1',
                `--http-port=${currentVlcHttpPort}`,
                `--http-password=${currentVlcHttpPassword}`,
            ]
            if (startPosition && startPosition > 0) {
                args.push(`--start-time=${startPosition}`)
            }
            args.push(filePath)
            currentPlayer = spawn('vlc', args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
        }

        const launchedPlayer = currentPlayer

        if (type === 'vlc' && currentPlayer) {
            currentPlayer.stdout?.on('data', (chunk: Buffer) => {
                const text = chunk.toString('utf8').trim()
                if (text) {
                    console.log(`[PlaybackDebug][vlc-stdout] ${text}`)
                }
            })
            currentPlayer.stderr?.on('data', (chunk: Buffer) => {
                const text = chunk.toString('utf8').trim()
                if (text) {
                    console.log(`[PlaybackDebug][vlc-stderr] ${text}`)
                }
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

                    if (mainWindow) {
                        try {
                            mainWindow.setAlwaysOnTop(false)
                            mainWindow.minimize()
                        } catch (err) {
                            console.warn('Failed to minimize window:', err)
                        }
                    }

                    const focusCommands = [
                        'wmctrl -a "VLC" 2>/dev/null',
                        'xdotool search --class "vlc" windowactivate --sync windowraise 2>/dev/null',
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
            }, 600)
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
            startProgressReporting()
        } else {
            console.warn('[PlaybackDebug] Missing jellyfin item id, progress/stopped will not be reported')
        }

        currentPlayer.on('error', (err) => {
            if (currentPlayer !== launchedPlayer) return
            console.error(`Failed to launch ${type}:`, err.message)
            clearProgressInterval()
            resetPlaybackState()

            if (mainWindow && mainWindow.isMinimized()) {
                mainWindow.restore()
                mainWindow.focus()
                mainWindow.setAlwaysOnTop(true)
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

            if (mainWindow && mainWindow.isMinimized()) {
                mainWindow.restore()
                mainWindow.focus()
            }
            if (mainWindow) {
                mainWindow.setAlwaysOnTop(true)
            }

            resetPlaybackState()
        })

        currentPlayer.unref()

        return { success: true }
    } catch (err: any) {
        clearVlcState()
        return { success: false, error: err.message || `Failed to launch ${type}` }
    }
}

/** Kill the current player process if running */
export async function stopPlayer(): Promise<void> {
    if (currentPlayer && !currentPlayer.killed) {
        stopRequestedByUser = true
        console.log(
            `[PlaybackDebug] stopPlayer called item=${currentItemId || 'none'} startSec=${playbackStartPositionSec} durationSec=${currentDurationSec || 0}`
        )
        await requestVlcStatusSnapshot()
        currentPlayer?.kill()
    }
}
