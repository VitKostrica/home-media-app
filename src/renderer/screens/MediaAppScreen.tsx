import React, { useState, useEffect, useRef, useCallback } from 'react'
import '../styles/MediaAppScreen.css'
import MediaCard from '../components/MediaCard'
import JellyfinLogin from '../components/JellyfinLogin'
import ShowDetailModal from '../components/ShowDetailModal'
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
    seriesName?: string
    seasonNumber?: number
    episodeNumber?: number
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
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false)
    const [vlcPlayingItem, setVlcPlayingItem] = useState<MediaItem | null>(null)
    const [continueWatchingItems, setContinueWatchingItems] = useState<MediaItem[]>([])
    const [nextUpItems, setNextUpItems] = useState<MediaItem[]>([])
    const { matches } = useKeybindings()

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
        setLoading(true)
        setError(null)
        try {
            const config = await window.electron?.configApi?.get()
            if (!config?.jellyfinApiKey || !config?.jellyfinUserId) {
                setIsAuthenticated(false)
                setItems([])
                setLoading(false)
                return
            }

            const api = window.electron?.jellyfinApi
            if (!api) {
                setError('Electron API not available')
                setLoading(false)
                return
            }

            let data: MediaItem[] = []

            if (activeTab === 0) {
                // Continue Watching tab: refresh Resume + Next Up each visit
                const [resumeItems, nextUpItems] = await Promise.all([
                    api.getResumeItems(),
                    api.getNextUpItems(),
                ])
                console.log(
                    `[Continue Watching] resume=${resumeItems?.length || 0}, nextUp=${nextUpItems?.length || 0}`
                )
                const resumeUnique = (resumeItems || []).filter((item) => item?.id)
                const seenIds = new Set<string>(resumeUnique.map((item) => item.id))
                const nextUpUnique = (nextUpItems || []).filter(
                    (item) => item?.id && !seenIds.has(item.id)
                )
                console.log(
                    `[Continue Watching] unique resume=${resumeUnique.length}, unique nextUp=${nextUpUnique.length}`
                )

                // Keep room for Next Up so it is always visible on this tab.
                const maxItems = 24
                const minNextUpSlots = nextUpUnique.length > 0 ? Math.min(8, nextUpUnique.length) : 0
                const resumeSlots = Math.min(resumeUnique.length, maxItems - minNextUpSlots)
                const nextUpSlots = Math.min(nextUpUnique.length, maxItems - resumeSlots)

                const continueRow = resumeUnique.slice(0, resumeSlots)
                const nextUpRow = nextUpUnique.slice(0, nextUpSlots)

                setContinueWatchingItems(continueRow)
                setNextUpItems(nextUpRow)
                data = [...continueRow, ...nextUpRow]
            } else if (activeTab === 1) {
                // Movies tab
                data = await api.getMovies()
                setContinueWatchingItems([])
                setNextUpItems([])
            } else {
                // Shows tab
                data = await api.getSeries()
                setContinueWatchingItems([])
                setNextUpItems([])
            }

            setItems(data || [])
            setGridIndex(0)
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to load library'
            setError(message)
        } finally {
            setLoading(false)
        }
    }

    const openItem = (item: MediaItem) => {
        setSelectedItem(item)
        if (item.type === 'series') {
            setShowShowDetail(true)
        } else {
            setShowDetail(true)
        }
    }

    const launchVlc = useCallback(async (item: MediaItem) => {
        console.log('Playing item:', item)
        console.log('File path:', item.filePath)
        console.log('Resume position:', item.resumePosition)

        if (!item.filePath) {
            console.warn('No file path for selected item')
            alert('No file path available for this item')
            return
        }

        try {
            const startPosition = item.resumePosition || 0

            console.log('Launching VLC with:', {
                filePath: item.filePath,
                startPosition,
                itemId: item.id,
            })

            const result = await window.electron?.playerApi?.launch(
                'vlc',
                item.filePath,
                startPosition,
                item.id,
                item.duration
            )

            console.log('VLC launch result:', result)

            if (result?.success) {
                setVlcPlayingItem(item)
                setShowDetail(false)
            } else {
                alert(`Failed to launch VLC: ${result?.error || 'Unknown error'}`)
            }
        } catch (err) {
            console.error('Failed to launch player:', err)
            alert('Error launching player')
        }
    }, [])

    const handlePlay = useCallback(async () => {
        if (!selectedItem?.filePath) {
            console.warn('No file path for selected item')
            return
        }

        await launchVlc(selectedItem)
    }, [launchVlc, selectedItem])

    // ── Keyboard Navigation ──────────────────────────────────

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Don't intercept keys when VLC is playing
            if (vlcPlayingItem) {
                if (matches(event.key, 'back')) {
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

            // Detail overlay mode
            if (showDetail) {
                if (matches(event.key, 'confirm')) {
                    handlePlay()
                    return
                }
                if (matches(event.key, 'back')) {
                    setShowDetail(false)
                    setSelectedItem(null)
                }
                return
            }

            // Grid browsing mode
            if (matches(event.key, 'left')) {
                if (gridIndex > 0) {
                    setGridIndex(prev => prev - 1)
                }
                return
            }
            if (matches(event.key, 'right')) {
                if (gridIndex < items.length - 1) {
                    setGridIndex(prev => prev + 1)
                }
                return
            }
            if (matches(event.key, 'up')) {
                const newIdx = gridIndex - COLUMNS
                if (newIdx >= 0) {
                    setGridIndex(newIdx)
                }
                return
            }
            if (matches(event.key, 'down')) {
                const newIdx = gridIndex + COLUMNS
                if (newIdx < items.length) {
                    setGridIndex(newIdx)
                }
                return
            }
            if (matches(event.key, 'confirm')) {
                if (items[gridIndex]) {
                    openItem(items[gridIndex])
                }
                return
            }
            if (matches(event.key, 'back')) {
                onNavigate('home')
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [gridIndex, items, showDetail, handlePlay, onNavigate, isAuthenticated, vlcPlayingItem, matches])

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
        } else if (tabIndex === 0) {
            fetchItems()
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

    return (
        <div className="media-app-screen">
            {/* Header */}
            <div className="media-app-header">
                <button className="back-button" onClick={() => onNavigate('home')}>
                    ← Home
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
                    <div className="media-section-wrap">
                        {continueWatchingItems.length > 0 && (
                            <div className="media-section">
                                <h2 className="section-title">Continue Watching</h2>
                                <div className="media-grid">
                                    {continueWatchingItems.map((item, index) => (
                                        <MediaCard
                                            key={item.id}
                                            item={item}
                                            isFocused={index === gridIndex}
                                            onSelect={() => openItem(item)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                        {nextUpItems.length > 0 && (
                            <div className="media-section">
                                <h2 className="section-title">Next Up</h2>
                                <div className="media-grid">
                                    {nextUpItems.map((item, index) => {
                                        const globalIndex = continueWatchingItems.length + index
                                        return (
                                            <MediaCard
                                                key={item.id}
                                                item={item}
                                                isFocused={globalIndex === gridIndex}
                                                onSelect={() => openItem(item)}
                                            />
                                        )
                                    })}
                                </div>
                            </div>
                        )}
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
                                onSelect={() => openItem(item)}
                            />
                        ))}
                    </div>
                )}
            </div>

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
                                <button className="play-button focused" onClick={handlePlay}>
                                    <span className="play-icon">▶</span>
                                    Play
                                </button>
                            </div>

                            {!selectedItem.filePath && (
                                <p className="detail-warning">
                                    ⚠ No local file path found for this item
                                </p>
                            )}

                            <p className="detail-nav-hint">
                                Enter play • Back close
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
                        void launchVlc({
                            ...episode,
                            type: 'episode',
                        })
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
