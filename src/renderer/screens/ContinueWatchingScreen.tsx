import React, { useState, useEffect, useCallback } from 'react'
import '../styles/ContinueWatchingScreen.css'
import MediaCard from '../components/MediaCard'
import JellyfinLogin from '../components/JellyfinLogin'
import { useKeybindings } from '../hooks/useKeybindings'
import { isEffectivelyFinished } from '../utils/playbackProgress'

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
    const [currentRow, setCurrentRow] = useState<'continue' | 'next'>('continue')
    const [playingItem, setPlayingItem] = useState<MediaItem | null>(null)
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

    useEffect(() => {
        const handlePlayerStopped = () => {
            setPlayingItem(null)
            fetchItems()
        }

        if (window.electron) {
            window.electron.on?.('player:stopped', handlePlayerStopped)
        }

        return () => {
            if (window.electron) {
                window.electron.off?.('player:stopped', handlePlayerStopped)
            }
        }
    }, [])

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
                        !isEffectivelyFinished(item)
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

    const launchVlc = useCallback(async (item: MediaItem) => {
        if (!item.filePath) {
            alert('File path not available')
            return
        }

        const startPosition = item.resumePosition
            ? Math.floor(item.resumePosition / 10000000)
            : 0

        try {
            const result = await window.electron?.playerApi?.launch(
                'vlc',
                item.filePath,
                startPosition,
                item.id,
                item.duration
            )
            if (result?.success) {
                setPlayingItem(item)
            } else {
                alert(`Failed to launch VLC: ${result?.error || 'Unknown error'}`)
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to play media'
            alert(`Error: ${message}`)
        }
    }, [])

    const handleClosePlayer = useCallback(async () => {
        try {
            await window.electron?.playerApi?.stop()
        } catch {
            // Ignore stop errors
        }
        setPlayingItem(null)
    }, [])

    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            if (playingItem) {
                if (matches(event.key, 'back')) {
                    event.preventDefault()
                    void handleClosePlayer()
                }
                return
            }

            const items = currentRow === 'continue' ? continueWatching : nextEpisodes
            if (items.length === 0 && matches(event.key, 'confirm')) {
                event.preventDefault()
                return
            }

            if (matches(event.key, 'right')) {
                event.preventDefault()
                if (items.length > 0) {
                    setFocusedIndex((prev) => (prev + 1) % items.length)
                }
                return
            }
            if (matches(event.key, 'left')) {
                event.preventDefault()
                if (items.length > 0) {
                    setFocusedIndex((prev) => (prev - 1 + items.length) % items.length)
                }
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
                    void launchVlc(items[focusedIndex])
                }
                return
            }
            if (matches(event.key, 'back')) {
                event.preventDefault()
                onNavigate('home')
            }
        },
        [playingItem, currentRow, focusedIndex, continueWatching, nextEpisodes, onNavigate, launchVlc, matches, handleClosePlayer]
    )

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleKeyDown])

    if (!isAuthenticated) {
        return <JellyfinLogin onSuccess={() => setIsAuthenticated(true)} />
    }

    if (playingItem) {
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
                                                onSelect={() => { void launchVlc(item) }}
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
                                                onSelect={() => { void launchVlc(item) }}
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
                        Use arrow keys to navigate | Space/Enter to play with VLC | Backspace to go back
                    </p>
                </footer>
            </div>
        </div>
    )
}

export default ContinueWatchingScreen
