import React, { useState, useRef, useEffect, useCallback } from 'react'
import '../styles/VideoPlayer.css'
import { useKeybindings } from '../hooks/useKeybindings'

interface VideoPlayerProps {
    filePath: string
    startPosition?: number
    jellyfinItemId?: string
    onClose: () => void
    onProgress?: (positionTicks: number) => void
    onEnded?: () => void
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
    filePath,
    startPosition = 0,
    jellyfinItemId,
    onClose,
    onProgress,
    onEnded,
}) => {
    const videoRef = useRef<HTMLVideoElement>(null)
    const [isPlaying, setIsPlaying] = useState(true)
    const [currentTime, setCurrentTime] = useState(startPosition)
    const [duration, setDuration] = useState(0)
    const [showControls, setShowControls] = useState(true)
    const [volume, setVolume] = useState(1)
    const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)
    const { matches } = useKeybindings()

    // Auto-hide controls after inactivity
    const resetControlsTimeout = useCallback(() => {
        if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current)
        }
        setShowControls(true)
        controlsTimeoutRef.current = setTimeout(() => {
            if (isPlaying) {
                setShowControls(false)
            }
        }, 3000)
    }, [isPlaying])

    // Report progress to Jellyfin periodically
    useEffect(() => {
        progressIntervalRef.current = setInterval(() => {
            if (videoRef.current && onProgress && isPlaying) {
                const positionTicks = Math.floor(videoRef.current.currentTime) * 10000000
                onProgress(positionTicks)
            }
        }, 5000) // Report every 5 seconds

        return () => {
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current)
            }
        }
    }, [isPlaying, onProgress])

    // Initialize video player
    useEffect(() => {
        const video = videoRef.current
        if (!video) return

        const initializeVideo = async () => {
            let videoSource = filePath

            console.log('VideoPlayer: Initializing video', {
                jellyfinItemId,
                filePath,
                startPosition,
                hasElectronApi: !!window.electron,
            })

            // Try to use Jellyfin API to get proper stream URL
            if (jellyfinItemId && window.electron) {
                try {
                    console.log('VideoPlayer: Requesting playback info for item:', jellyfinItemId)
                    const playbackInfo = await window.electron.jellyfinApi.getPlaybackInfo(jellyfinItemId)
                    console.log('VideoPlayer: Playback info received:', playbackInfo)

                    if (playbackInfo?.streamUrl) {
                        videoSource = playbackInfo.streamUrl
                        console.log('VideoPlayer: Got Jellyfin stream URL:', videoSource)

                        // Report playback start to Jellyfin
                        const startPositionTicks = startPosition * 10000000
                        console.log('VideoPlayer: Reporting playback start:', {
                            itemId: jellyfinItemId,
                            positionTicks: startPositionTicks,
                        })
                        await window.electron.jellyfinApi.reportPlaybackStart(jellyfinItemId, startPositionTicks)
                    } else {
                        throw new Error('No stream URL from playback info')
                    }
                } catch (err) {
                    console.error('Failed to get Jellyfin playback info, falling back to file path:', err)
                    // Fall back to file path
                    videoSource = filePath.startsWith('file://') ? filePath : `file://${filePath}`
                }
            } else if (!window.electron) {
                console.warn('VideoPlayer: Electron API not available, using file path')
                videoSource = filePath.startsWith('file://') ? filePath : `file://${filePath}`
            } else {
                // No item ID, use file path
                videoSource = filePath.startsWith('file://') ? filePath : `file://${filePath}`
            }

            console.log('VideoPlayer: Setting video source:', videoSource)
            console.log('VideoPlayer: Start position:', startPosition)

            video.src = videoSource
            video.currentTime = startPosition

            // Try to play immediately
            try {
                await video.play()
            } catch (err) {
                console.error('Failed to play video:', err)
            }
        }

        initializeVideo()

        const handlePlay = () => setIsPlaying(true)
        const handlePause = () => setIsPlaying(false)
        const handleTimeUpdate = () => {
            setCurrentTime(video.currentTime)
        }
        const handleLoadedMetadata = () => {
            setDuration(video.duration)
        }
        const handleEnded = () => {
            setIsPlaying(false)
            if (onEnded) onEnded()
        }
        const handleKeyDown = (e: KeyboardEvent) => {
            handlePlayerKeydown(e)
        }

        video.addEventListener('play', handlePlay)
        video.addEventListener('pause', handlePause)
        video.addEventListener('timeupdate', handleTimeUpdate)
        video.addEventListener('loadedmetadata', handleLoadedMetadata)
        video.addEventListener('ended', handleEnded)
        window.addEventListener('keydown', handleKeyDown)

        return () => {
            video.removeEventListener('play', handlePlay)
            video.removeEventListener('pause', handlePause)
            video.removeEventListener('timeupdate', handleTimeUpdate)
            video.removeEventListener('loadedmetadata', handleLoadedMetadata)
            video.removeEventListener('ended', handleEnded)
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [filePath, startPosition, onEnded, jellyfinItemId, matches, onClose])

    const handlePlayerKeydown = (e: KeyboardEvent) => {
        resetControlsTimeout()

        if (matches(e.key, 'confirm')) {
            e.preventDefault()
            togglePlayPause()
            return
        }

        if (matches(e.key, 'right')) {
            e.preventDefault()
            seek(10)
            return
        }

        if (matches(e.key, 'left')) {
            e.preventDefault()
            seek(-10)
            return
        }

        if (matches(e.key, 'up')) {
            e.preventDefault()
            changeVolume(0.1)
            return
        }

        if (matches(e.key, 'down')) {
            e.preventDefault()
            changeVolume(-0.1)
            return
        }

        if (matches(e.key, 'back')) {
            e.preventDefault()
            onClose()
            return
        }

        if (e.key === 'm' || e.key === 'M') {
            e.preventDefault()
            toggleMute()
            return
        }

        if (e.key === 'f' || e.key === 'F') {
            e.preventDefault()
            toggleFullscreen()
        }
    }

    const togglePlayPause = () => {
        if (videoRef.current) {
            if (videoRef.current.paused) {
                videoRef.current.play()
            } else {
                videoRef.current.pause()
            }
        }
    }

    const seek = (offset: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime + offset)
        }
    }

    const changeVolume = (offset: number) => {
        if (videoRef.current) {
            const newVolume = Math.max(0, Math.min(1, volume + offset))
            videoRef.current.volume = newVolume
            setVolume(newVolume)
        }
    }

    const toggleMute = () => {
        if (videoRef.current) {
            videoRef.current.muted = !videoRef.current.muted
        }
    }

    const toggleFullscreen = () => {
        if (document.fullscreenElement) {
            document.exitFullscreen()
        } else {
            document.documentElement.requestFullscreen()
        }
    }

    const formatTime = (seconds: number): string => {
        const h = Math.floor(seconds / 3600)
        const m = Math.floor((seconds % 3600) / 60)
        const s = Math.floor(seconds % 60)
        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
        }
        return `${m}:${s.toString().padStart(2, '0')}`
    }

    return (
        <div className="video-player-container" onMouseMove={resetControlsTimeout}>
            <video
                ref={videoRef}
                className="video-player"
                onMouseMove={resetControlsTimeout}
                onClick={() => {
                    resetControlsTimeout()
                    togglePlayPause()
                }}
            />

            {showControls && (
                <div className="video-controls">
                    <div className="progress-bar">
                        <div
                            className="progress-fill"
                            style={{
                                width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%',
                            }}
                        />
                        <input
                            type="range"
                            min="0"
                            max={duration || 0}
                            value={currentTime}
                            onChange={(e) => {
                                if (videoRef.current) {
                                    videoRef.current.currentTime = parseFloat(e.target.value)
                                }
                            }}
                            className="progress-slider"
                        />
                    </div>

                    <div className="control-bar">
                        <button
                            className="control-btn"
                            onClick={togglePlayPause}
                            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                        >
                            {isPlaying ? '⏸' : '▶'}
                        </button>

                        <div className="time-display">
                            <span className="current-time">{formatTime(currentTime)}</span>
                            <span className="separator"> / </span>
                            <span className="duration">{formatTime(duration)}</span>
                        </div>

                        <div className="volume-control">
                            <button
                                className="control-btn"
                                onClick={toggleMute}
                                title="Mute (M)"
                            >
                                {volume === 0 || videoRef.current?.muted ? '🔇' : '🔊'}
                            </button>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.1"
                                value={volume}
                                onChange={(e) => {
                                    const newVolume = parseFloat(e.target.value)
                                    if (videoRef.current) {
                                        videoRef.current.volume = newVolume
                                    }
                                    setVolume(newVolume)
                                }}
                                className="volume-slider"
                                title="Volume (Up/Down)"
                            />
                        </div>

                        <button
                            className="control-btn close-btn"
                            onClick={onClose}
                            title="Close (Backspace)"
                        >
                            ✕
                        </button>
                    </div>

                    <div className="keyboard-hints">
                        <div className="hint">Space: Play/Pause | ← →: Seek | ↑ ↓: Volume | M: Mute | Backspace: Close</div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default VideoPlayer
