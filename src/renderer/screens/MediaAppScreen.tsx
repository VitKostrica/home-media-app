import React, { useState, useEffect, useRef, useCallback } from 'react'
import '../styles/MediaAppScreen.css'
import MediaCard from '../components/MediaCard'
import JellyfinLogin from '../components/JellyfinLogin'
import ShowDetailModal from '../components/ShowDetailModal'
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
    seriesName?: string
    seasonNumber?: number
    episodeNumber?: number
}

interface MediaAppScreenProps {
    onNavigate: (screen: string) => void
}

type ActiveTab = 0 | 1 | 2
type SidebarIndex = 0 | 1 | 2 | 3
type FocusArea = 'sidebar' | 'content'
type ContinueRow = 'continue' | 'next'

const COLUMNS = 6
const CONTINUE_WATCHING_ROW_LIMIT = 6
const NEXT_UP_ROW_LIMIT = 6
const NEXT_UP_RETRY_DELAY_MS = 400

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatTime(totalSeconds: number): string {
    const h = Math.floor(totalSeconds / 3600)
    const m = Math.floor((totalSeconds % 3600) / 60)
    const s = Math.floor(totalSeconds % 60)
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }
    return `${m}:${s.toString().padStart(2, '0')}`
}

function HomeIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 11.5L12 4l8 7.5" />
            <path d="M6.5 10.5V20h11V10.5" />
            <path d="M10 20v-6h4v6" />
        </svg>
    )
}

function ContinueIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8" />
            <path d="M12 7v5l3.5 2.1" />
            <path d="M6.5 8.5A7.5 7.5 0 0 1 12 4.5c2.1 0 4 .9 5.4 2.3" />
            <path d="M16.2 6.2h1.5v3.5" />
        </svg>
    )
}

function MoviesIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4" y="5" width="16" height="14" rx="2" />
            <path d="M8 5v14" />
            <path d="M16 5v14" />
            <path d="M4 9h16" />
            <path d="M4 13h16" />
        </svg>
    )
}

function ShowsIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4" y="6" width="16" height="11" rx="2" />
            <path d="M9 20h6" />
            <path d="M12 17v3" />
            <path d="M9.5 9.5h5" />
        </svg>
    )
}

function PlayIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5v14l12-7z" />
        </svg>
    )
}

const MediaAppScreen: React.FC<MediaAppScreenProps> = ({ onNavigate }) => {
    const [activeTab, setActiveTab] = useState<ActiveTab>(0)
    const [items, setItems] = useState<MediaItem[]>([])
    const [loading, setLoading] = useState<boolean>(true)
    const [error, setError] = useState<string | null>(null)
    const [continueWatchingItems, setContinueWatchingItems] = useState<MediaItem[]>([])
    const [nextUpItems, setNextUpItems] = useState<MediaItem[]>([])
    const [sidebarIndex, setSidebarIndex] = useState<SidebarIndex>(1)
    const [focusedArea, setFocusedArea] = useState<FocusArea>('content')
    const [continueRow, setContinueRow] = useState<ContinueRow>('continue')
    const [continueIndex, setContinueIndex] = useState<number>(0)
    const [gridIndex, setGridIndex] = useState<number>(0)
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false)
    const [vlcPlayingItem, setVlcPlayingItem] = useState<MediaItem | null>(null)
    const [showDetail, setShowDetail] = useState<boolean>(false)
    const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null)
    const [showShowDetail, setShowShowDetail] = useState<boolean>(false)
    const { matches } = useKeybindings()

    const contentRef = useRef<HTMLDivElement>(null)
    const skipNextAutoRefreshRef = useRef(false)

    const focusContinueWatching = useCallback((row: ContinueRow = 'continue', index: number = 0) => {
        setActiveTab(0)
        setFocusedArea('content')
        setContinueRow(row)
        setContinueIndex(index)
    }, [])

    const focusGrid = useCallback((tab: Exclude<ActiveTab, 0>, index: number = 0) => {
        setActiveTab(tab)
        setFocusedArea('content')
        setGridIndex(index)
    }, [])

    const fetchItems = useCallback(
        async (tabIndex: ActiveTab = activeTab, options?: { retryNextUp?: boolean }) => {
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

                if (tabIndex === 0) {
                    const resumeItems = await api.getResumeItems()
                    let nextUpItems = await api.getNextUpItems()

                    if (options?.retryNextUp && nextUpItems.length === 0) {
                        await sleep(NEXT_UP_RETRY_DELAY_MS)
                        nextUpItems = await api.getNextUpItems()
                    }

                    const resumeUnique = (resumeItems || []).filter(
                        (item) => item?.id && !isEffectivelyFinished(item)
                    )
                    const seenIds = new Set<string>(resumeUnique.map((item) => item.id))
                    const nextUpUnique = (nextUpItems || []).filter(
                        (item) => item?.id && !seenIds.has(item.id)
                    )

                    const continueRowItems = resumeUnique.slice(0, CONTINUE_WATCHING_ROW_LIMIT)
                    const nextUpRowItems = nextUpUnique.slice(0, NEXT_UP_ROW_LIMIT)

                    setContinueWatchingItems(continueRowItems)
                    setNextUpItems(nextUpRowItems)
                    data = [...continueRowItems, ...nextUpRowItems]
                } else if (tabIndex === 1) {
                    data = await api.getMovies()
                    setContinueWatchingItems([])
                    setNextUpItems([])
                } else {
                    data = await api.getSeries()
                    setContinueWatchingItems([])
                    setNextUpItems([])
                }

                setItems(data || [])
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Failed to load library'
                setError(message)
            } finally {
                setLoading(false)
            }
        },
        [activeTab]
    )

    useEffect(() => {
        checkAuth()
    }, [])

    useEffect(() => {
        if (!isAuthenticated) {
            return
        }

        if (skipNextAutoRefreshRef.current && activeTab === 0) {
            skipNextAutoRefreshRef.current = false
            return
        }

        void fetchItems(activeTab)
    }, [activeTab, isAuthenticated, fetchItems])

    useEffect(() => {
        const handlePlayerStopped = () => {
            setVlcPlayingItem(null)
            skipNextAutoRefreshRef.current = true
            setFocusedArea('content')
            focusContinueWatching('continue', 0)
            void fetchItems(0, { retryNextUp: true })
        }

        if (window.electron) {
            window.electron.on?.('player:stopped', handlePlayerStopped)
        }

        return () => {
            if (window.electron) {
                window.electron.off?.('player:stopped', handlePlayerStopped)
            }
        }
    }, [fetchItems, focusContinueWatching])

    useEffect(() => {
        if (!isAuthenticated || loading || error) {
            return
        }

        if (activeTab === 0) {
            if (continueRow === 'continue' && continueWatchingItems.length > 0) {
                setContinueIndex((prev) => Math.min(prev, Math.max(continueWatchingItems.length - 1, 0)))
            } else if (continueRow === 'next' && nextUpItems.length > 0) {
                setContinueIndex((prev) => Math.min(prev, Math.max(nextUpItems.length - 1, 0)))
            } else if (continueWatchingItems.length > 0) {
                setContinueRow('continue')
                setContinueIndex(0)
            } else if (nextUpItems.length > 0) {
                setContinueRow('next')
                setContinueIndex(0)
            }
            return
        }

        if (items.length > 0) {
            setGridIndex((prev) => Math.min(prev, Math.max(items.length - 1, 0)))
        }
    }, [
        activeTab,
        continueRow,
        continueWatchingItems.length,
        error,
        isAuthenticated,
        items.length,
        loading,
        nextUpItems.length,
    ])

    useEffect(() => {
        if (focusedArea !== 'content' || activeTab === 0 || !contentRef.current) {
            return
        }

        const focused = contentRef.current.querySelector('.media-card.focused')
        if (focused) {
            focused.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
        }
    }, [activeTab, focusedArea, gridIndex])

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

    const launchVlc = useCallback(async (item: MediaItem) => {
        if (!item.filePath) {
            alert('File path not available')
            return
        }

        const startPosition = item.resumePosition ? Math.floor(item.resumePosition / 10000000) : 0

        try {
            const result = await window.electron?.playerApi?.launch(
                'vlc',
                item.filePath,
                startPosition,
                item.id,
                item.duration
            )
            if (result?.success) {
                setVlcPlayingItem(item)
            } else {
                alert(`Failed to launch VLC: ${result?.error || 'Unknown error'}`)
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to play media'
            alert(`Error: ${message}`)
        }
    }, [])

    const handlePlay = useCallback(async () => {
        if (!selectedItem?.filePath) {
            return
        }

        await launchVlc(selectedItem)
    }, [launchVlc, selectedItem])

    const handleClosePlayer = useCallback(async () => {
        try {
            await window.electron?.playerApi?.stop()
        } catch {
            // Ignore stop errors
        }
        setVlcPlayingItem(null)
    }, [])

    const openItem = useCallback((item: MediaItem) => {
        setSelectedItem(item)
        if (item.type === 'series') {
            setShowShowDetail(true)
        } else {
            setShowDetail(true)
        }
    }, [])

    const activateSidebarItem = useCallback(
        (index: SidebarIndex) => {
            setSidebarIndex(index)

            if (index === 0) {
                onNavigate('home')
                return
            }

            if (index === 1) {
                focusContinueWatching('continue', 0)
                return
            }

            if (index === 2) {
                focusGrid(1, 0)
                return
            }

            focusGrid(2, 0)
        },
        [focusContinueWatching, focusGrid, onNavigate]
    )

    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            if (vlcPlayingItem) {
                if (matches(event.key, 'back')) {
                    event.preventDefault()
                    void handleClosePlayer()
                }
                return
            }

            if (showDetail) {
                if (matches(event.key, 'confirm')) {
                    event.preventDefault()
                    void handlePlay()
                    return
                }
                if (matches(event.key, 'back')) {
                    event.preventDefault()
                    setShowDetail(false)
                    setSelectedItem(null)
                }
                return
            }

            if (showShowDetail) {
                if (matches(event.key, 'back')) {
                    event.preventDefault()
                    setShowShowDetail(false)
                    setSelectedItem(null)
                }
                return
            }

            const tag = (event.target as HTMLElement)?.tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
                return
            }

            if (!isAuthenticated) {
                return
            }

            if (matches(event.key, 'back')) {
                event.preventDefault()
                onNavigate('home')
                return
            }

            const safeGridIndex = Math.min(gridIndex, Math.max(items.length - 1, 0))

            if (focusedArea === 'sidebar') {
                if (matches(event.key, 'up')) {
                    event.preventDefault()
                    setSidebarIndex((prev) => Math.max(0, prev - 1) as SidebarIndex)
                    return
                }
                if (matches(event.key, 'down')) {
                    event.preventDefault()
                    setSidebarIndex((prev) => Math.min(3, prev + 1) as SidebarIndex)
                    return
                }
                if (matches(event.key, 'left')) {
                    event.preventDefault()
                    return
                }
                if (matches(event.key, 'right')) {
                    event.preventDefault()
                    setFocusedArea('content')
                    return
                }
                if (matches(event.key, 'confirm')) {
                    event.preventDefault()
                    activateSidebarItem(sidebarIndex)
                }
                return
            }

            if (matches(event.key, 'left')) {
                event.preventDefault()
                if (activeTab === 0) {
                    if (continueIndex > 0) {
                        setContinueIndex((prev) => Math.max(0, prev - 1))
                    } else {
                        setFocusedArea('sidebar')
                        setSidebarIndex(1)
                    }
                    return
                }

                if (items.length > 0 && safeGridIndex % COLUMNS !== 0) {
                    setGridIndex((prev) => Math.max(0, prev - 1))
                } else {
                    setFocusedArea('sidebar')
                    setSidebarIndex(activeTab === 1 ? 2 : 3)
                }
                return
            }

            if (activeTab === 0) {
                const currentList = continueRow === 'continue' ? continueWatchingItems : nextUpItems
                const currentMax = Math.max(currentList.length - 1, 0)
                const safeIndex = Math.min(continueIndex, currentMax)

                if (matches(event.key, 'right')) {
                    event.preventDefault()
                    if (currentList.length > 0 && safeIndex < currentMax) {
                        setContinueIndex(safeIndex + 1)
                    }
                    return
                }

                if (matches(event.key, 'down')) {
                    event.preventDefault()
                    if (continueRow === 'continue' && nextUpItems.length > 0) {
                        setContinueRow('next')
                        setContinueIndex(0)
                    }
                    return
                }

                if (matches(event.key, 'up')) {
                    event.preventDefault()
                    if (continueRow === 'next' && continueWatchingItems.length > 0) {
                        setContinueRow('continue')
                        setContinueIndex(0)
                    }
                    return
                }

                if (matches(event.key, 'confirm')) {
                    event.preventDefault()
                    const item = currentList[safeIndex]
                    if (item) {
                        void launchVlc(item)
                    }
                    return
                }
                return
            }

            if (matches(event.key, 'right')) {
                event.preventDefault()
                if (safeGridIndex < items.length - 1) {
                    setGridIndex(safeGridIndex + 1)
                }
                return
            }

            if (matches(event.key, 'down')) {
                event.preventDefault()
                const newIndex = safeGridIndex + COLUMNS
                if (newIndex < items.length) {
                    setGridIndex(newIndex)
                }
                return
            }

            if (matches(event.key, 'up')) {
                event.preventDefault()
                const newIndex = safeGridIndex - COLUMNS
                if (newIndex >= 0) {
                    setGridIndex(newIndex)
                }
                return
            }

            if (matches(event.key, 'confirm')) {
                event.preventDefault()
                const item = items[safeGridIndex]
                if (item) {
                    openItem(item)
                }
            }
        },
        [
            activeTab,
            continueIndex,
            continueRow,
            continueWatchingItems,
            focusedArea,
            gridIndex,
            handleClosePlayer,
            handlePlay,
            isAuthenticated,
            items,
            launchVlc,
            matches,
            nextUpItems,
            onNavigate,
            showDetail,
            showShowDetail,
            sidebarIndex,
            vlcPlayingItem,
            openItem,
        ]
    )

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleKeyDown])

    const sidebarItems = [
        { label: 'Home', icon: HomeIcon },
        { label: 'Continue Watching', icon: ContinueIcon },
        { label: 'Movies', icon: MoviesIcon },
        { label: 'Shows', icon: ShowsIcon },
    ]

    if (!isAuthenticated) {
        return <JellyfinLogin onSuccess={() => setIsAuthenticated(true)} />
    }

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
            <div className="media-app-shell">
                <aside className="media-sidebar" aria-label="Media navigation">
                    <button
                        className={`sidebar-button sidebar-home ${
                            focusedArea === 'sidebar' && sidebarIndex === 0 ? 'focused' : ''
                        }`}
                        onClick={() => activateSidebarItem(0)}
                        aria-label="Home"
                    >
                        <HomeIcon />
                        <span className="sr-only">Home</span>
                    </button>

                    <div className="sidebar-divider" />

                    <div className="sidebar-nav">
                        {sidebarItems.slice(1).map((item, index) => {
                            const actualIndex = (index + 1) as SidebarIndex
                            const isFocused = focusedArea === 'sidebar' && sidebarIndex === actualIndex
                            const isActive =
                                (actualIndex === 1 && activeTab === 0) ||
                                (actualIndex === 2 && activeTab === 1) ||
                                (actualIndex === 3 && activeTab === 2)

                            return (
                                <button
                                    key={item.label}
                                    className={`sidebar-button ${isFocused ? 'focused' : ''} ${
                                        isActive ? 'active' : ''
                                    }`}
                                    onClick={() => activateSidebarItem(actualIndex)}
                                    aria-label={item.label}
                                >
                                    <item.icon />
                                    <span className="sr-only">{item.label}</span>
                                </button>
                            )
                        })}
                    </div>

                    <div className="sidebar-bottom">
                        <p>Back</p>
                        <span>Enter</span>
                    </div>
                </aside>

                <main className="media-main">
                    {error && (
                        <div className="error-message">
                            <p>Error: {error}</p>
                        </div>
                    )}

                    {loading ? (
                        <div className="loading">Loading...</div>
                    ) : (
                        <>
                            {activeTab === 0 ? (
                                <div className="media-section-wrap continue-watching-view" ref={contentRef}>
                                    {continueWatchingItems.length > 0 && (
                                        <section className={`media-section ${continueRow === 'continue' ? 'focused' : ''}`}>
                                            <div className="section-header">
                                                <h2 className="section-title">
                                                    <span className="section-title-icon" aria-hidden="true">
                                                        <ContinueIcon />
                                                    </span>
                                                    Continue Watching
                                                </h2>
                                                <span className="section-meta">{continueWatchingItems.length} items</span>
                                            </div>
                                            <div className="media-grid">
                                                {continueWatchingItems.map((item, index) => (
                                                    <div
                                                        key={item.id}
                                                        className={`media-item-wrapper ${
                                                            continueRow === 'continue' && continueIndex === index ? 'focused' : ''
                                                        }`}
                                                    >
                                                        <MediaCard
                                                            item={item}
                                                            onSelect={() => {
                                                                focusContinueWatching('continue', index)
                                                                openItem(item)
                                                            }}
                                                            showProgress={true}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    )}

                                    {nextUpItems.length > 0 && (
                                        <section className={`media-section ${continueRow === 'next' ? 'focused' : ''}`}>
                                            <div className="section-header">
                                                <h2 className="section-title">
                                                    <span className="section-title-icon" aria-hidden="true">
                                                        <ShowsIcon />
                                                    </span>
                                                    Next Up
                                                </h2>
                                                <span className="section-meta">{nextUpItems.length} items</span>
                                            </div>
                                            <div className="media-grid">
                                                {nextUpItems.map((item, index) => (
                                                    <div
                                                        key={item.id}
                                                        className={`media-item-wrapper ${
                                                            continueRow === 'next' && continueIndex === index ? 'focused' : ''
                                                        }`}
                                                    >
                                                        <MediaCard
                                                            item={item}
                                                            onSelect={() => {
                                                                focusContinueWatching('next', index)
                                                                openItem(item)
                                                            }}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    )}

                                    {continueWatchingItems.length === 0 && nextUpItems.length === 0 && (
                                        <div className="empty-state">
                                            <p>No media found in your library.</p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="media-grid-view" ref={contentRef}>
                                    {items.map((item, index) => (
                                        <MediaCard
                                            key={item.id}
                                            item={item}
                                            isFocused={index === gridIndex}
                                            onSelect={() => {
                                                setGridIndex(index)
                                                openItem(item)
                                            }}
                                        />
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </main>
            </div>

            {showDetail && selectedItem && (
                <div className="detail-overlay" onClick={() => { setShowDetail(false); setSelectedItem(null) }}>
                    <div className="detail-card" onClick={(e) => e.stopPropagation()}>
                        <div className="detail-poster">
                            {selectedItem.posterUrl ? (
                                <img src={selectedItem.posterUrl} alt={selectedItem.title} />
                            ) : (
                                <div className="detail-poster-placeholder">
                                    <span>{selectedItem.title.charAt(0).toUpperCase()}</span>
                                </div>
                            )}
                        </div>

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

                            <div className="detail-actions">
                                <button className="play-button focused" onClick={handlePlay}>
                                    <span className="play-icon">
                                        <PlayIcon />
                                    </span>
                                    Play
                                </button>
                            </div>

                            {!selectedItem.filePath && (
                                <p className="detail-warning">⚠ No local file path found for this item</p>
                            )}

                            <p className="detail-nav-hint">Enter play • Back close</p>
                        </div>
                    </div>
                </div>
            )}

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
        </div>
    )
}

export default MediaAppScreen
