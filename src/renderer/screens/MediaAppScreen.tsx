import React, { useState, useEffect, useRef, useCallback } from 'react'
import '../styles/MediaAppScreen.css'
import MediaCard from '../components/MediaCard'
import JellyfinLogin from '../components/JellyfinLogin'
import VideoPlayer from '../components/VideoPlayer'
import ShowDetailModal from '../components/ShowDetailModal'

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

interface MediaAppScreenProps {
    onNavigate: (screen: string) => void
}

const COLUMNS = 6

function formatTime(totalSeconds: number): string {
    const h = Math.floor(totalSeconds / 3600)
    const m = Math.floor((totalSeconds % 3600) / 60)
    const s = Math.floor(totalSeconds % 60)
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }
    return `${m}:${s.toString().padStart(2, '0')}`
}

const MediaAppScreen: React.FC<MediaAppScreenProps> = ({ onNavigate }) => {
    // State
    const [activeTab, setActiveTab] = useState<number>(0) // 0 = Continue Watching, 1 = Movies, 2 = Shows
    const [items, setItems] = useState<MediaItem[]>([])
    const [loading, setLoading] = useState<boolean>(true)
    const [error, setError] = useState<string | null>(null)
    const [gridIndex, setGridIndex] = useState<number>(0)
    const [showDetail, setShowDetail] = useState<boolean>(false)
    const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null)
    const [showShowDetail, setShowShowDetail] = useState<boolean>(false)
    const [playerBtnIndex, setPlayerBtnIndex] = useState<number>(0) // 0 = HTML5, 1 = VLC
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false)
    const [playingItem, setPlayingItem] = useState<MediaItem | null>(null)
    const [vlcPlayingItem, setVlcPlayingItem] = useState<MediaItem | null>(null)
    const [showPlayerSelect, setShowPlayerSelect] = useState<MediaItem | null>(null)
    const [selectedPlayerType, setSelectedPlayerType] = useState<'html5' | 'vlc'>('html5')
    const [itemsCache, setItemsCache] = useState<{ [key: number]: MediaItem[] }>({})

    const gridRef = useRef<HTMLDivElement>(null)

    // Check auth status on mount
    useEffect(() => {
        checkAuth()
    }, [])

    // Fetch items when tab changes or auth status changes
    useEffect(() => {
        if (isAuthenticated) {
            fetchItems()
        }
    }, [activeTab, isAuthenticated])

    // Listen for player stopped event (from global backspace shortcut)
    useEffect(() => {
        const handlePlayerStopped = () => {
            console.log('Player stopped - clearing VLC overlay and refreshing continue watching')
            setVlcPlayingItem(null)
            setActiveTab(0) // Switch to Continue Watching tab
            fetchItems() // Reload the continue watching data
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
        // Check cache first
        if (itemsCache[activeTab]) {
            setItems(itemsCache[activeTab])
            setLoading(false)
            setGridIndex(0)
            return
        }

        setLoading(true)
        setError(null)
        try {
            const api = window.electron?.jellyfinApi
            if (!api) {
                setError('Electron API not available')
                setLoading(false)
                return
            }

            let data: MediaItem[] = []

            if (activeTab === 0) {
                // Continue Watching tab - use dedicated endpoint
                const resumeItems = await api.getResumeItems()
                console.log('Resume items count:', resumeItems?.length || 0)
                if (resumeItems && resumeItems.length > 0) {
                    console.log('Sample resume items:', resumeItems.slice(0, 3).map(i => ({
                        title: i.title,
                        type: i.type,
                        playedPercentage: i.playedPercentage,
                    })))
                }
                data = (resumeItems || []).slice(0, 24)
            } else if (activeTab === 1) {
                // Movies tab
                data = await api.getMovies()
            } else {
                // Shows tab
                data = await api.getSeries()
            }

            // Cache the results
            setItemsCache(prev => ({ ...prev, [activeTab]: data }))
            setItems(data || [])
            setGridIndex(0)
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to load library'
            setError(message)
        } finally {
            setLoading(false)
        }
    }

    const handlePlayClick = (item: MediaItem) => {
        setSelectedItem(item)
        setShowPlayerSelect(item)
        setPlayerBtnIndex(0)
    }

    const playWithPlayer = useCallback(async (item: MediaItem, playerType: 'html5' | 'vlc') => {
        console.log('Playing item:', item)
        console.log('File path:', item.filePath)
        console.log('Resume position:', item.resumePosition)

        if (!item.filePath) {
            console.warn('No file path for selected item')
            alert('No file path available for this item')
            return
        }
        try {
            if (playerType === 'html5') {
                // Use embedded HTML5 player
                console.log('Starting HTML5 player with:', {
                    filePath: item.filePath,
                    startPosition: item.resumePosition ? Math.floor(item.resumePosition / 10000000) : 0,
                })
                setPlayingItem(item)
                setShowPlayerSelect(null)
                setShowDetail(false)
            } else if (playerType === 'vlc') {
                // Launch VLC as fullscreen overlay
                const startPosition = item.resumePosition
                    ? Math.floor(item.resumePosition / 10000000)
                    : 0

                console.log('Launching VLC with:', {
                    filePath: item.filePath,
                    startPosition,
                    itemId: item.id,
                })

                const result = await window.electron?.playerApi?.launch(
                    'vlc',
                    item.filePath,
                    startPosition,
                    item.id
                )

                console.log('VLC launch result:', result)

                if (result?.success) {
                    setVlcPlayingItem(item)
                    setShowPlayerSelect(null)
                    setShowDetail(false)
                } else {
                    alert(`Failed to launch VLC: ${result?.error || 'Unknown error'}`)
                }
            }
        } catch (err) {
            console.error('Failed to launch player:', err)
            alert('Error launching player')
        }
    }, [])

    const handlePlay = useCallback(async (playerType: 'html5' | 'vlc') => {
        if (!selectedItem?.filePath) {
            console.warn('No file path for selected item')
            return
        }
        try {
            if (playerType === 'html5') {
                // Use embedded HTML5 player
                setPlayingItem(selectedItem)
                setShowDetail(false)
            } else if (playerType === 'vlc') {
                // Launch VLC as fullscreen overlay
                const startPosition = selectedItem.resumePosition
                    ? Math.floor(selectedItem.resumePosition / 10000000)
                    : 0

                const result = await window.electron?.playerApi?.launch(
                    'vlc',
                    selectedItem.filePath,
                    startPosition,
                    selectedItem.id
                )

                if (result?.success) {
                    setVlcPlayingItem(selectedItem)
                    setShowDetail(false)
                } else {
                    alert(`Failed to launch VLC: ${result?.error || 'Unknown error'}`)
                }
            }
        } catch (err) {
            console.error('Failed to launch player:', err)
            alert('Error launching player')
        }
    }, [selectedItem])

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

    // ── Keyboard Navigation ──────────────────────────────────

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Don't intercept keys when video is playing
            if (playingItem || vlcPlayingItem) {
                if (vlcPlayingItem && event.key === 'Backspace') {
                    // Allow closing VLC with Backspace
                    event.preventDefault()
                    window.electron?.playerApi?.stop()
                    setVlcPlayingItem(null)

                    // Refresh continue watching list and go back to it
                    setActiveTab(0) // Switch to Continue Watching tab
                    fetchItems() // Reload the continue watching data
                }
                return
            }

            // Don't intercept keys when typing in input fields
            const tag = (event.target as HTMLElement)?.tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
                return
            }

            // Don't intercept when login form is shown
            if (!isAuthenticated) {
                return
            }

            event.preventDefault()

            // Player selection modal
            if (showPlayerSelect) {
                switch (event.key) {
                    case 'ArrowLeft':
                        setPlayerBtnIndex(0)
                        setSelectedPlayerType('html5')
                        break
                    case 'ArrowRight':
                        setPlayerBtnIndex(1)
                        setSelectedPlayerType('vlc')
                        break
                    case 'Enter':
                    case ' ':
                        playWithPlayer(showPlayerSelect, selectedPlayerType)
                        break
                    case 'Backspace':
                        setShowPlayerSelect(null)
                        break
                }
                return
            }

            // Detail overlay mode
            if (showDetail) {
                switch (event.key) {
                    case 'ArrowLeft':
                        setPlayerBtnIndex(0)
                        break
                    case 'ArrowRight':
                        setPlayerBtnIndex(1)
                        break
                    case 'Enter':
                    case ' ':
                        handlePlay(playerBtnIndex === 0 ? 'html5' : 'vlc')
                        break
                    case 'Backspace':
                        setShowDetail(false)
                        setSelectedItem(null)
                        break
                }
                return
            }

            // Grid browsing mode
            switch (event.key) {
                case 'ArrowLeft':
                    if (gridIndex > 0) {
                        setGridIndex(prev => prev - 1)
                    }
                    break
                case 'ArrowRight':
                    if (gridIndex < items.length - 1) {
                        setGridIndex(prev => prev + 1)
                    }
                    break
                case 'ArrowUp': {
                    const newIdx = gridIndex - COLUMNS
                    if (newIdx >= 0) {
                        setGridIndex(newIdx)
                    }
                    break
                }
                case 'ArrowDown': {
                    const newIdx = gridIndex + COLUMNS
                    if (newIdx < items.length) {
                        setGridIndex(newIdx)
                    }
                    break
                }
                case 'Enter':
                case ' ':
                    if (items[gridIndex]) {
                        setSelectedItem(items[gridIndex])
                        setShowDetail(true)
                        setPlayerBtnIndex(0)
                    }
                    break
                case 'Backspace':
                    onNavigate('home')
                    break
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [gridIndex, items, showDetail, playerBtnIndex, handlePlay, onNavigate, isAuthenticated, playingItem, vlcPlayingItem, showPlayerSelect, selectedPlayerType, playWithPlayer])

    // Scroll focused card into view
    useEffect(() => {
        if (gridRef.current) {
            const focused = gridRef.current.querySelector('.media-card.focused')
            if (focused) {
                focused.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
            }
        }
    }, [gridIndex])

    // Tab switching
    const handleTabSwitch = (tabIndex: number) => {
        if (tabIndex !== activeTab) {
            setActiveTab(tabIndex)
            setGridIndex(0)
        }
    }

    // ── Render ────────────────────────────────────────────────

    // Show VLC playing overlay
    if (vlcPlayingItem) {
        return (
            <div className="vlc-playing-overlay">
                <div className="vlc-playing-content">
                    <div className="vlc-playing-icon">▶ VLC</div>
                    <p className="vlc-playing-title">{vlcPlayingItem.title}</p>
                    <p className="vlc-playing-hint">Press Backspace to close VLC</p>
                </div>
            </div>
        )
    }

    // Show video player if HTML5 media is playing
    if (playingItem) {
        return (
            <VideoPlayer
                filePath={playingItem.filePath || ''}
                startPosition={
                    playingItem.resumePosition
                        ? Math.floor(playingItem.resumePosition / 10000000)
                        : 0
                }
                jellyfinItemId={playingItem.id}
                onClose={() => setPlayingItem(null)}
                onProgress={handlePlayerProgress}
            />
        )
    }

    return (
        <div className="media-app-screen">
            {/* Header */}
            <div className="media-app-header">
                <button className="back-button" onClick={() => onNavigate('home')}>
                    ← Back
                </button>
                <h1 className="media-app-title">Custom Media</h1>
                <div className="header-spacer" />
            </div>

            {/* Category Tabs */}
            <div className="category-tabs">
                <button
                    className={`category-tab ${activeTab === 0 ? 'active' : ''}`}
                    onClick={() => handleTabSwitch(0)}
                >
                    Continue Watching
                </button>
                <button
                    className={`category-tab ${activeTab === 1 ? 'active' : ''}`}
                    onClick={() => handleTabSwitch(1)}
                >
                    Movies
                </button>
                <button
                    className={`category-tab ${activeTab === 2 ? 'active' : ''}`}
                    onClick={() => handleTabSwitch(2)}
                >
                    Shows
                </button>
            </div>

            {/* Content Area */}
            <div className="media-content" ref={gridRef}>
                {/* Loading State */}
                {loading && (
                    <div className="media-state-message">
                        <div className="loading-spinner" />
                        <p>Loading library...</p>
                    </div>
                )}

                {/* Not Authenticated – show login form */}
                {!loading && !isAuthenticated && (
                    <JellyfinLogin onSuccess={() => setIsAuthenticated(true)} />
                )}

                {/* Error State */}
                {!loading && error && (
                    <div className="media-state-message">
                        <div className="state-icon">⚠</div>
                        <h2>Something went wrong</h2>
                        <p className="state-hint">{error}</p>
                        <button className="retry-button" onClick={fetchItems}>
                            Retry
                        </button>
                    </div>
                )}

                {/* Empty State */}
                {!loading && !error && isAuthenticated && items.length === 0 && (
                    <div className="media-state-message">
                        <div className="state-icon">📭</div>
                        <h2>No items found</h2>
                        <p className="state-hint">
                            {activeTab === 0
                                ? 'No items in continue watching'
                                : activeTab === 1
                                ? 'No movies in your Jellyfin library'
                                : 'No shows in your Jellyfin library'}
                        </p>
                    </div>
                )}

                {/* Continue Watching Grid (tab 0) */}
                {!loading && !error && isAuthenticated && activeTab === 0 && items.length > 0 && (
                    <div className="media-grid">
                        {items.map((item, index) => (
                            <MediaCard
                                key={item.id}
                                item={item}
                                isFocused={index === gridIndex}
                                onSelect={() => {
                                    setSelectedItem(item)
                                    if (item.type === 'series') {
                                        setShowShowDetail(true)
                                    } else {
                                        setShowDetail(true)
                                        setPlayerBtnIndex(0)
                                    }
                                }}
                            />
                        ))}
                    </div>
                )}

                {/* Media Grid (for Movies and Shows tabs) */}
                {!loading && !error && isAuthenticated && activeTab !== 0 && items.length > 0 && (
                    <div className="media-grid">
                        {items.map((item, index) => (
                            <MediaCard
                                key={item.id}
                                item={item}
                                isFocused={index === gridIndex}
                                onSelect={() => {
                                    setSelectedItem(item)
                                    if (item.type === 'series') {
                                        setShowShowDetail(true)
                                    } else {
                                        setShowDetail(true)
                                        setPlayerBtnIndex(0)
                                    }
                                }}
                            />
                        ))}
                    </div>
                )}
            </div>

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

            {/* Detail Overlay */}
            {showDetail && selectedItem && (
                <div className="detail-overlay" onClick={() => { setShowDetail(false); setSelectedItem(null) }}>
                    <div className="detail-card" onClick={(e) => e.stopPropagation()}>
                        {/* Poster */}
                        <div className="detail-poster">
                            {selectedItem.posterUrl ? (
                                <img src={selectedItem.posterUrl} alt={selectedItem.title} />
                            ) : (
                                <div className="detail-poster-placeholder">
                                    <span>{selectedItem.title.charAt(0).toUpperCase()}</span>
                                </div>
                            )}
                        </div>

                        {/* Info */}
                        <div className="detail-info">
                            <h2 className="detail-title">
                                {selectedItem.title}
                                {selectedItem.year && (
                                    <span className="detail-year"> ({selectedItem.year})</span>
                                )}
                            </h2>

                            <div className="detail-meta">
                                <span className="detail-type">
                                    {selectedItem.type === 'movie' ? 'Movie' : 'Series'}
                                </span>
                                {selectedItem.duration && selectedItem.duration > 0 && (
                                    <span className="detail-duration">
                                        {formatTime(selectedItem.duration)}
                                    </span>
                                )}
                                {selectedItem.watched && (
                                    <span className="detail-watched-badge">✓ Watched</span>
                                )}
                            </div>

                            {selectedItem.overview && (
                                <p className="detail-overview">{selectedItem.overview}</p>
                            )}

                            {/* Progress */}
                            {selectedItem.duration && selectedItem.resumePosition && selectedItem.resumePosition > 0 && (
                                <div className="detail-progress-section">
                                    <div className="detail-progress-label">
                                        Resume from {formatTime(selectedItem.resumePosition)} / {formatTime(selectedItem.duration)}
                                    </div>
                                    <div className="detail-progress-bar">
                                        <div
                                            className="detail-progress-fill"
                                            style={{ width: `${selectedItem.playedPercentage || 0}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Player Buttons */}
                            <div className="detail-actions">
                                <button
                                    className={`play-button ${playerBtnIndex === 0 ? 'focused' : ''}`}
                                    onClick={() => handlePlay('html5')}
                                >
                                    <span className="play-icon">▶</span>
                                    Play with HTML5
                                </button>
                                <button
                                    className={`play-button ${playerBtnIndex === 1 ? 'focused' : ''}`}
                                    onClick={() => handlePlay('vlc')}
                                >
                                    <span className="play-icon">▶</span>
                                    Play with VLC
                                </button>
                            </div>

                            {!selectedItem.filePath && (
                                <p className="detail-warning">
                                    ⚠ No local file path found for this item
                                </p>
                            )}

                            <p className="detail-nav-hint">
                                ← → select player • Enter play • Back close
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Show Detail Modal */}
            {showShowDetail && selectedItem && (
                <ShowDetailModal
                    show={{
                        id: selectedItem.id,
                        title: selectedItem.title,
                        posterUrl: selectedItem.posterUrl,
                        overview: selectedItem.overview,
                        year: selectedItem.year,
                    }}
                    onClose={() => {
                        setShowShowDetail(false)
                        setSelectedItem(null)
                    }}
                    onPlay={(episode) => {
                        setShowShowDetail(false)
                        setSelectedItem(null)
                        setShowPlayerSelect(episode)
                    }}
                />
            )}

            {/* Footer */}
            <div className="media-app-footer">
                <p>↑↓←→ Navigate • Enter Select • Back Return home</p>
            </div>
        </div>
    )
}

export default MediaAppScreen
