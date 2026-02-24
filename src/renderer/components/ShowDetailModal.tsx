import React, { useState, useEffect } from 'react'
import '../styles/ShowDetailModal.css'
import LazyImage from './LazyImage'

interface Episode {
    id: string
    title: string
    episodeNumber?: number
    posterUrl?: string
    overview?: string
    duration?: number
    resumePosition?: number
    playedPercentage?: number
    watched: boolean
    filePath?: string
}

interface Season {
    id: string
    title: string
    seasonNumber?: number
    posterUrl?: string
    overview?: string
}

interface ShowDetailModalProps {
    show: {
        id: string
        title: string
        posterUrl?: string
        overview?: string
        year?: number
    }
    onClose: () => void
    onPlay: (itemId: string, itemTitle: string) => void
}

type ViewMode = 'show' | 'episodes'

const ShowDetailModal: React.FC<ShowDetailModalProps> = ({ show, onClose, onPlay }) => {
    const [viewMode, setViewMode] = useState<ViewMode>('show')
    const [seasons, setSeasons] = useState<Season[]>([])
    const [episodes, setEpisodes] = useState<Episode[]>([])
    const [selectedSeason, setSelectedSeason] = useState<Season | null>(null)
    const [loading, setLoading] = useState(false)
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [columnCount] = useState(6)
    const [continueWatchingEpisode, setContinueWatchingEpisode] = useState<Episode | null>(null)

    // Fetch seasons and find continue watching episode
    useEffect(() => {
        fetchSeasons()
    }, [])

    const findContinueWatchingEpisode = async (seasonsList: Season[]) => {
        // Try to find an episode with resume position
        for (const season of seasonsList) {
            try {
                const eps = await window.electron.jellyfinApi.getEpisodes(show.id, season.id)
                // Find first episode with resume position or first unwatched
                const resumeEp = eps.find((e: Episode) => e.resumePosition && e.resumePosition > 0)
                if (resumeEp) {
                    setContinueWatchingEpisode(resumeEp)
                    return
                }
                const unwatchedEp = eps.find((e: Episode) => !e.watched)
                if (unwatchedEp) {
                    setContinueWatchingEpisode(unwatchedEp)
                    return
                }
            } catch (err) {
                console.error('Failed to fetch episodes for season:', season.id, err)
            }
        }
    }

    const fetchSeasons = async () => {
        try {
            setLoading(true)
            const response = await window.electron.jellyfinApi.getSeasons(show.id)
            setSeasons(response)
            await findContinueWatchingEpisode(response)
        } catch (err) {
            console.error('Failed to fetch seasons:', err)
        } finally {
            setLoading(false)
        }
    }

    const fetchEpisodes = async (seasonId: string) => {
        try {
            setLoading(true)
            const response = await window.electron.jellyfinApi.getEpisodes(show.id, seasonId)
            setEpisodes(response)
            setSelectedIndex(0)
        } catch (err) {
            console.error('Failed to fetch episodes:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleSeasonSelect = (season: Season) => {
        setSelectedSeason(season)
        fetchEpisodes(season.id)
        setViewMode('episodes')
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' || e.key === 'Escape') {
            if (viewMode === 'show') {
                onClose()
            } else if (viewMode === 'episodes') {
                setViewMode('show')
                setSelectedIndex(0)
            }
            return
        }

        if (viewMode === 'show') {
            const rowSize = columnCount
            if (e.key === 'ArrowDown') {
                setSelectedIndex(Math.min(selectedIndex + rowSize, seasons.length - 1))
                e.preventDefault()
            } else if (e.key === 'ArrowUp') {
                setSelectedIndex(Math.max(selectedIndex - rowSize, 0))
                e.preventDefault()
            } else if (e.key === 'ArrowRight') {
                setSelectedIndex(Math.min(selectedIndex + 1, seasons.length - 1))
                e.preventDefault()
            } else if (e.key === 'ArrowLeft') {
                setSelectedIndex(Math.max(selectedIndex - 1, 0))
                e.preventDefault()
            } else if (e.key === 'Enter' || e.key === ' ') {
                handleSeasonSelect(seasons[selectedIndex])
                e.preventDefault()
            }
        } else if (viewMode === 'episodes') {
            const rowSize = columnCount
            if (e.key === 'ArrowDown') {
                setSelectedIndex(Math.min(selectedIndex + rowSize, episodes.length - 1))
                e.preventDefault()
            } else if (e.key === 'ArrowUp') {
                setSelectedIndex(Math.max(selectedIndex - rowSize, 0))
                e.preventDefault()
            } else if (e.key === 'ArrowRight') {
                setSelectedIndex(Math.min(selectedIndex + 1, episodes.length - 1))
                e.preventDefault()
            } else if (e.key === 'ArrowLeft') {
                setSelectedIndex(Math.max(selectedIndex - 1, 0))
                e.preventDefault()
            } else if (e.key === 'Enter' || e.key === ' ') {
                const episode = episodes[selectedIndex]
                onPlay(episode.id, episode.title)
                e.preventDefault()
            }
        }
    }

    return (
        <div
            className="show-detail-modal"
            onClick={onClose}
            onKeyDown={handleKeyDown}
            tabIndex={0}
            autoFocus
        >
            <div className="show-detail-card" onClick={(e) => e.stopPropagation()}>
                {viewMode === 'show' && (
                    <div className="show-detail-view">
                        <div className="show-header">
                            <div className="show-detail-poster">
                                {show.posterUrl ? (
                                    <LazyImage src={show.posterUrl} alt={show.title} />
                                ) : (
                                    <div className="show-detail-poster-placeholder">
                                        {show.title.charAt(0).toUpperCase()}
                                    </div>
                                )}
                            </div>

                            <div className="show-detail-info">
                                <h2 className="show-detail-title">
                                    {show.title}
                                    {show.year && <span className="show-detail-year"> ({show.year})</span>}
                                </h2>

                                {show.overview && (
                                    <p className="show-detail-overview">{show.overview}</p>
                                )}

                                {/* Continue Watching / Next Episode */}
                                {continueWatchingEpisode && (
                                    <div className="continue-watching-section">
                                        <p className="continue-label">
                                            {continueWatchingEpisode.resumePosition && continueWatchingEpisode.resumePosition > 0
                                                ? 'Continue Watching'
                                                : 'Next Episode'}
                                        </p>
                                        <button
                                            className="continue-button"
                                            onClick={() => {
                                                onPlay(continueWatchingEpisode.id, continueWatchingEpisode.title)
                                            }}
                                        >
                                            <span className="play-icon">▶</span>
                                            {continueWatchingEpisode.episodeNumber && `E${continueWatchingEpisode.episodeNumber}: `}
                                            {continueWatchingEpisode.title}
                                        </button>
                                    </div>
                                )}

                                <p className="show-detail-nav-hint">
                                    ↑ ↓ ← → select season • Enter play • Back close
                                </p>
                            </div>
                        </div>

                        <div className="show-seasons-section">
                            <h3 className="seasons-title">Seasons</h3>
                            {loading ? (
                                <p>Loading seasons...</p>
                            ) : seasons.length === 0 ? (
                                <p>No seasons found</p>
                            ) : (
                                <div className="seasons-grid" style={{ gridTemplateColumns: `repeat(${columnCount}, 1fr)` }}>
                                    {seasons.map((season, idx) => (
                                        <div
                                            key={season.id}
                                            className={`season-card ${idx === selectedIndex ? 'focused' : ''}`}
                                        >
                                            <div className="season-poster">
                                                {season.posterUrl ? (
                                                    <LazyImage src={season.posterUrl} alt={season.title} />
                                                ) : (
                                                    <div className="season-poster-placeholder">
                                                        {season.seasonNumber !== undefined ? `S${season.seasonNumber}` : 'S?'}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="season-info">
                                                <p className="season-title">{season.title}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {viewMode === 'episodes' && (
                    <div className="show-episodes-view">
                        <h3 className="view-title">
                            {show.title} - {selectedSeason?.title}
                        </h3>

                        <div className="episodes-grid" style={{ gridTemplateColumns: `repeat(${columnCount}, 1fr)` }}>
                            {loading ? (
                                <p>Loading episodes...</p>
                            ) : episodes.length === 0 ? (
                                <p>No episodes found</p>
                            ) : (
                                episodes.map((episode, idx) => (
                                    <div
                                        key={episode.id}
                                        className={`episode-card ${idx === selectedIndex ? 'focused' : ''}`}
                                    >
                                        <div className="episode-poster">
                                            {episode.posterUrl ? (
                                                <LazyImage src={episode.posterUrl} alt={episode.title} />
                                            ) : (
                                                <div className="episode-poster-placeholder">
                                                    {episode.episodeNumber !== undefined ? `E${episode.episodeNumber}` : 'E?'}
                                                </div>
                                            )}
                                        </div>
                                        <div className="episode-info">
                                            <p className="episode-title">
                                                {episode.episodeNumber && `E${episode.episodeNumber}: `}
                                                {episode.title}
                                            </p>
                                            {episode.playedPercentage && episode.playedPercentage > 0 && !episode.watched && (
                                                <div className="episode-progress-bar">
                                                    <div
                                                        className="episode-progress-fill"
                                                        style={{ width: `${episode.playedPercentage}%` }}
                                                    />
                                                </div>
                                            )}
                                            {episode.watched && (
                                                <p className="episode-watched-badge">✓ Watched</p>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <p className="show-detail-nav-hint">
                            ↑ ↓ ← → select episode • Enter play • Back seasons
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}

export default ShowDetailModal
