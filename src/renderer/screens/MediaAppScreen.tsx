import React, { useState, useEffect, useRef, useCallback } from 'react'
import '../styles/MediaAppScreen.css'
import MediaCard from '../components/MediaCard'
import JellyfinLogin from '../components/JellyfinLogin'

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
    onBack: () => void
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

const MediaAppScreen: React.FC<MediaAppScreenProps> = ({ onBack }) => {
    // State
    const [activeTab, setActiveTab] = useState<number>(0) // 0 = Movies, 1 = Shows
    const [items, setItems] = useState<MediaItem[]>([])
    const [loading, setLoading] = useState<boolean>(true)
    const [error, setError] = useState<string | null>(null)
    const [gridIndex, setGridIndex] = useState<number>(0)
    const [showDetail, setShowDetail] = useState<boolean>(false)
    const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null)
    const [playerBtnIndex, setPlayerBtnIndex] = useState<number>(0) // 0 = MPV, 1 = VLC
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false)

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
            if (!api) {
                setError('Electron API not available')
                setLoading(false)
                return
            }
            const data = activeTab === 0
                ? await api.getMovies()
                : await api.getSeries()
            setItems(data || [])
            setGridIndex(0)
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to load library'
            setError(message)
        } finally {
            setLoading(false)
        }
    }

    const handlePlay = useCallback(async (player: 'mpv' | 'vlc') => {
        if (!selectedItem?.filePath) {
            console.warn('No file path for selected item')
            return
        }
        try {
            const result = await window.electron?.playerApi?.launch(
                player,
                selectedItem.filePath,
                selectedItem.resumePosition || 0
            )
            if (result && !result.success) {
                console.error('Player launch failed:', result.error)
            }
        } catch (err) {
            console.error('Failed to launch player:', err)
        }
    }, [selectedItem])

    // ── Keyboard Navigation ──────────────────────────────────

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
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
                switch (event.key) {
                    case 'ArrowLeft':
                        setPlayerBtnIndex(0)
                        break
                    case 'ArrowRight':
                        setPlayerBtnIndex(1)
                        break
                    case 'Enter':
                    case ' ':
                        handlePlay(playerBtnIndex === 0 ? 'mpv' : 'vlc')
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
                    onBack()
                    break
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [gridIndex, items, showDetail, playerBtnIndex, handlePlay, onBack, isAuthenticated])

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

    return (
        <div className="media-app-screen">
            {/* Header */}
            <div className="media-app-header">
                <button className="back-button" onClick={onBack}>
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
                    Movies
                </button>
                <button
                    className={`category-tab ${activeTab === 1 ? 'active' : ''}`}
                    onClick={() => handleTabSwitch(1)}
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
                                ? 'No movies in your Jellyfin library'
                                : 'No shows in your Jellyfin library'}
                        </p>
                    </div>
                )}

                {/* Media Grid */}
                {!loading && !error && items.length > 0 && (
                    <div className="media-grid">
                        {items.map((item, index) => (
                            <MediaCard
                                key={item.id}
                                item={item}
                                isFocused={index === gridIndex}
                                onSelect={() => {
                                    setSelectedItem(item)
                                    setShowDetail(true)
                                    setPlayerBtnIndex(0)
                                }}
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
                                <button
                                    className={`play-button ${playerBtnIndex === 0 ? 'focused' : ''}`}
                                    onClick={() => handlePlay('mpv')}
                                >
                                    <span className="play-icon">▶</span>
                                    Play with MPV
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

            {/* Footer */}
            <div className="media-app-footer">
                <p>↑↓←→ Navigate • Enter Select • Back Return home</p>
            </div>
        </div>
    )
}

export default MediaAppScreen
