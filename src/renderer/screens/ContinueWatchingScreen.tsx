import React, { useState, useEffect, useCallback } from 'react'
import '../styles/ContinueWatchingScreen.css'
import MediaCard from '../components/MediaCard'
import VideoPlayer from '../components/VideoPlayer'
import JellyfinLogin from '../components/JellyfinLogin'
import { useKeybindings } from '../hooks/useKeybindings'

interface MediaItem {
    id: string
    title: string
    type: 'movie' | 'series' | 'episode'
    year?: number
    posterUrl?: string
    overview?: string
    duration?: number
    watched: boolean
    resumePosition?: number
    playedPercentage?: number
    filePath?: string
}

interface ContinueWatchingScreenProps {
    onNavigate: (screen: string) => void
}

const ContinueWatchingScreen: React.FC<ContinueWatchingScreenProps> = ({ onNavigate }) => {
    const [continueWatching, setContinueWatching] = useState<MediaItem[]>([])
    const [nextEpisodes, setNextEpisodes] = useState<MediaItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [focusedIndex, setFocusedIndex] = useState(0)
    const [currentRow, setCurrentRow] = useState<'continue' | 'next'>(
        'continue'
    )
    const [playingItem, setPlayingItem] = useState<MediaItem | null>(null)
    const [selectedPlayerType, setSelectedPlayerType] = useState<'html5' | 'vlc'>('html5')
    const [showPlayerSelect, setShowPlayerSelect] = useState<MediaItem | null>(null)
    const { matches } = useKeybindings()

    // Check auth on mount
    useEffect(() => {
        checkAuth()
    }, [])

    // Fetch items when authenticated
    useEffect(() => {
        if (isAuthenticated) {
            fetchItems()
        }
    }, [isAuthenticated])

    const checkAuth = async () => {
        try {
            const config = await window.electron?.configApi?.get()
            if (config?.jellyfinApiKey && config?.jellyfinUserId) {
                setIsAuthenticated(true)
            } else {
                setIsAuthenticated(false)
                setLoading(false)
            }
        } catch {
            setIsAuthenticated(false)
            setLoading(false)
        }
    }

    const fetchItems = async () => {
        setLoading(true)
        setError(null)
        try {
            const api = window.electron?.jellyfinApi

            // Get movies and series to filter for items with resume position
            const [movies, series] = await Promise.all([
                api?.getMovies() || [],
                api?.getSeries() || [],
            ])

            // Filter items that have been partially watched (continue watching)
            const continueList = [...movies, ...series]
                .filter(
                    (item) =>
                        item.watched === false &&
                        item.resumePosition &&
                        item.resumePosition > 0 &&
                        item.playedPercentage &&
                        item.playedPercentage < 90
                )
                .slice(0, 12)

            // For next episodes, we'd need more complex logic to get the next episode of each series
            // For now, show recently added unwatched items
            const nextList = [...movies, ...series]
                .filter((item) => item.watched === false && (!item.resumePosition || item.resumePosition === 0))
                .slice(0, 12)

            setContinueWatching(continueList)
            setNextEpisodes(nextList)
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to load items'
            setError(message)
        } finally {
            setLoading(false)
        }
    }

    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            if (playingItem) return // Don't handle nav keys while playing

            // Handle player selection modal
            if (showPlayerSelect) {
                if (matches(event.key, 'left')) {
                    event.preventDefault()
                    setSelectedPlayerType('html5')
                    return
                }
                if (matches(event.key, 'right')) {
                    event.preventDefault()
                    setSelectedPlayerType('vlc')
                    return
                }
                if (matches(event.key, 'confirm')) {
                    event.preventDefault()
                    playWithPlayer(showPlayerSelect, selectedPlayerType)
                    return
                }
                if (matches(event.key, 'back')) {
                    event.preventDefault()
                    setShowPlayerSelect(null)
                }
                return
            }

            const items = currentRow === 'continue' ? continueWatching : nextEpisodes
            if (matches(event.key, 'right')) {
                event.preventDefault()
                setFocusedIndex((prev) => (prev + 1) % items.length)
                return
            }
            if (matches(event.key, 'left')) {
                event.preventDefault()
                setFocusedIndex((prev) => (prev - 1 + items.length) % items.length)
                return
            }
            if (matches(event.key, 'down')) {
                event.preventDefault()
                if (currentRow === 'continue' && nextEpisodes.length > 0) {
                    setCurrentRow('next')
                    setFocusedIndex(Math.min(focusedIndex, nextEpisodes.length - 1))
                }
                return
            }
            if (matches(event.key, 'up')) {
                event.preventDefault()
                if (currentRow === 'next' && continueWatching.length > 0) {
                    setCurrentRow('continue')
                    setFocusedIndex(Math.min(focusedIndex, continueWatching.length - 1))
                }
                return
            }
            if (matches(event.key, 'confirm')) {
                event.preventDefault()
                if (items[focusedIndex]) {
                    playMedia(items[focusedIndex])
                }
                return
            }
            if (matches(event.key, 'back')) {
                event.preventDefault()
                onNavigate('home')
            }
        },
        [playingItem, currentRow, focusedIndex, continueWatching, nextEpisodes, onNavigate, showPlayerSelect, selectedPlayerType, matches]
    )

    useEffect(() => {
        if (!playingItem) {
            window.addEventListener('keydown', handleKeyDown)
            return () => window.removeEventListener('keydown', handleKeyDown)
        }
    }, [handleKeyDown, playingItem])

    const playMedia = async (item: MediaItem) => {
        if (!item.filePath) {
            alert('File path not available')
            return
        }
        // Show player selection modal
        setShowPlayerSelect(item)
    }

    const playWithPlayer = async (item: MediaItem, playerType: 'html5' | 'vlc') => {
        if (!item.filePath) {
            alert('File path not available')
            return
        }

        const startPosition = item.resumePosition
            ? Math.floor(item.resumePosition / 10000000)
            : 0

        try {
            if (playerType === 'html5') {
                // Use embedded HTML5 player
                setPlayingItem(item)
                setShowPlayerSelect(null)
            } else if (playerType === 'vlc') {
                // Launch VLC
                const result = await window.electron?.playerApi?.launch(
                    'vlc',
                    item.filePath,
                    startPosition,
                    item.id,
                    item.duration
                )
                if (result?.success) {
                    setPlayingItem(item)
                    setShowPlayerSelect(null)
                } else {
                    alert(`Failed to launch VLC: ${result?.error || 'Unknown error'}`)
                }
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to play media'
            alert(`Error: ${message}`)
        }
    }

    const handleClosePlayer = async () => {
        // Report final progress
        if (playingItem) {
            try {
                await window.electron?.playerApi?.stop()
            } catch {
                // Ignore errors
            }
        }
        setPlayingItem(null)
    }

    const handlePlayerProgress = async (positionTicks: number) => {
        if (playingItem) {
            try {
                await window.electron?.jellyfinApi?.reportProgress(
                    playingItem.id,
                    positionTicks
                )
            } catch {
                // Ignore progress reporting errors
            }
        }
    }

    if (!isAuthenticated) {
        return <JellyfinLogin onSuccess={() => setIsAuthenticated(true)} />
    }

    if (playingItem && selectedPlayerType === 'html5') {
        return (
            <VideoPlayer
                filePath={playingItem.filePath || ''}
                startPosition={
                    playingItem.resumePosition
                        ? Math.floor(playingItem.resumePosition / 10000000)
                        : 0
                }
                jellyfinItemId={playingItem.id}
                onClose={handleClosePlayer}
                onProgress={handlePlayerProgress}
            />
        )
    }

    if (playingItem && selectedPlayerType === 'vlc') {
        return (
            <div className="vlc-playing-overlay">
                <div className="vlc-playing-content">
                    <div className="vlc-playing-icon">▶ VLC</div>
                    <p className="vlc-playing-title">{playingItem.title}</p>
                    <p className="vlc-playing-hint">Press Backspace to close VLC</p>
                </div>
            </div>
        )
    }

    return (
        <div className="continue-watching-screen">
            {/* Player Selection Modal */}
            {showPlayerSelect && (
                <div className="player-select-modal" onClick={() => setShowPlayerSelect(null)}>
                    <div className="player-select-content" onClick={(e) => e.stopPropagation()}>
                        <h2>Select Player</h2>
                        <p className="player-select-title">{showPlayerSelect.title}</p>
                        <div className="player-buttons">
                            <button
                                className={`player-btn ${selectedPlayerType === 'html5' ? 'focused' : ''}`}
                                onClick={() => playWithPlayer(showPlayerSelect, 'html5')}
                            >
                                <span className="player-icon">🎬</span>
                                <span className="player-name">HTML5 Player</span>
                                <span className="player-desc">Embedded in app</span>
                            </button>
                            <button
                                className={`player-btn ${selectedPlayerType === 'vlc' ? 'focused' : ''}`}
                                onClick={() => playWithPlayer(showPlayerSelect, 'vlc')}
                            >
                                <span className="player-icon">▶</span>
                                <span className="player-name">VLC Player</span>
                                <span className="player-desc">Fullscreen overlay</span>
                            </button>
                        </div>
                        <p className="player-select-hint">
                            Use arrow keys to select • Enter to play • Backspace to close
                        </p>
                    </div>
                </div>
            )}

            <div className="screen-content">
                <header className="screen-header">
                    <h1>Home Media Center</h1>
                </header>

                {error && (
                    <div className="error-message">
                        <p>Error: {error}</p>
                    </div>
                )}

                {loading ? (
                    <div className="loading">Loading...</div>
                ) : (
                    <>
                        {/* Continue Watching Row */}
                        {continueWatching.length > 0 && (
                            <section className={`media-row ${
                                currentRow === 'continue' ? 'focused' : ''
                            }`}>
                                <h2 className="row-title">Continue Watching</h2>
                                <div className="media-grid">
                                    {continueWatching.map((item, index) => (
                                        <div
                                            key={item.id}
                                            className={`media-item-wrapper ${
                                                currentRow === 'continue' &&
                                                focusedIndex === index
                                                    ? 'focused'
                                                    : ''
                                            }`}
                                        >
                                            <MediaCard
                                                item={item}
                                                onSelect={() => playMedia(item)}
                                                showProgress={true}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Next Episodes / New Content Row */}
                        {nextEpisodes.length > 0 && (
                            <section className={`media-row ${
                                currentRow === 'next' ? 'focused' : ''
                            }`}>
                                <h2 className="row-title">Up Next & New</h2>
                                <div className="media-grid">
                                    {nextEpisodes.map((item, index) => (
                                        <div
                                            key={item.id}
                                            className={`media-item-wrapper ${
                                                currentRow === 'next' &&
                                                focusedIndex === index
                                                    ? 'focused'
                                                    : ''
                                            }`}
                                        >
                                            <MediaCard
                                                item={item}
                                                onSelect={() => playMedia(item)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {continueWatching.length === 0 &&
                            nextEpisodes.length === 0 && (
                                <div className="empty-state">
                                    <p>No media found in your library.</p>
                                </div>
                            )}
                    </>
                )}

                <footer className="screen-footer">
                    <p>
                        Use arrow keys to navigate | Space/Enter to play | Backspace to go back
                    </p>
                </footer>
            </div>
        </div>
    )
}

export default ContinueWatchingScreen
