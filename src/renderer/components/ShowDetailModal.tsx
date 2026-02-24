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

type ViewMode = 'show' | 'seasons' | 'episodes'

const ShowDetailModal: React.FC<ShowDetailModalProps> = ({ show, onClose, onPlay }) => {
    const [viewMode, setViewMode] = useState<ViewMode>('show')
    const [seasons, setSeasons] = useState<Season[]>([])
    const [episodes, setEpisodes] = useState<Episode[]>([])
    const [selectedSeason, setSelectedSeason] = useState<Season | null>(null)
    const [loading, setLoading] = useState(false)
    const [selectedIndex, setSelectedIndex] = useState(0)

    // Fetch seasons when modal opens
    useEffect(() => {
        fetchSeasons()
    }, [])

    const fetchSeasons = async () => {
        try {
            setLoading(true)
            const response = await window.electron.jellyfinApi.getSeasons(show.id)
            setSeasons(response)
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
                setViewMode('seasons')
                setSelectedIndex(0)
            } else if (viewMode === 'seasons') {
                setViewMode('show')
                setSelectedIndex(0)
            }
            return
        }

        if (viewMode === 'show') {
            if (e.key === 'Enter' || e.key === ' ') {
                setViewMode('seasons')
                setSelectedIndex(0)
                e.preventDefault()
            }
        } else if (viewMode === 'seasons') {
            if (e.key === 'ArrowDown') {
                setSelectedIndex(Math.min(selectedIndex + 1, seasons.length - 1))
                e.preventDefault()
            } else if (e.key === 'ArrowUp') {
                setSelectedIndex(Math.max(selectedIndex - 1, 0))
                e.preventDefault()
            } else if (e.key === 'Enter' || e.key === ' ') {
                handleSeasonSelect(seasons[selectedIndex])
                e.preventDefault()
            }
        } else if (viewMode === 'episodes') {
            if (e.key === 'ArrowDown') {
                setSelectedIndex(Math.min(selectedIndex + 1, episodes.length - 1))
                e.preventDefault()
            } else if (e.key === 'ArrowUp') {
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

                            <div className="show-detail-actions">
                                <button className="show-detail-button focused">
                                    View Seasons →
                                </button>
                            </div>

                            <p className="show-detail-nav-hint">
                                Enter view seasons • Back close
                            </p>
                        </div>
                    </div>
                )}

                {viewMode === 'seasons' && (
                    <div className="show-seasons-view">
                        <h3 className="view-title">Seasons</h3>

                        <div className="seasons-list">
                            {loading ? (
                                <p>Loading seasons...</p>
                            ) : seasons.length === 0 ? (
                                <p>No seasons found</p>
                            ) : (
                                seasons.map((season, idx) => (
                                    <div
                                        key={season.id}
                                        className={`season-item ${idx === selectedIndex ? 'focused' : ''}`}
                                    >
                                        <div className="season-poster-small">
                                            {season.posterUrl ? (
                                                <LazyImage src={season.posterUrl} alt={season.title} />
                                            ) : (
                                                <div className="season-poster-placeholder">
                                                    {season.seasonNumber !== undefined ? `S${season.seasonNumber}` : 'S?'}
                                                </div>
                                            )}
                                        </div>
                                        <div className="season-info-small">
                                            <p className="season-title">{season.title}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <p className="show-detail-nav-hint">
                            ↑ ↓ select • Enter view episodes • Back show
                        </p>
                    </div>
                )}

                {viewMode === 'episodes' && (
                    <div className="show-episodes-view">
                        <h3 className="view-title">
                            {show.title} - {selectedSeason?.title}
                        </h3>

                        <div className="episodes-list">
                            {loading ? (
                                <p>Loading episodes...</p>
                            ) : episodes.length === 0 ? (
                                <p>No episodes found</p>
                            ) : (
                                episodes.map((episode, idx) => (
                                    <div
                                        key={episode.id}
                                        className={`episode-item ${idx === selectedIndex ? 'focused' : ''}`}
                                    >
                                        <div className="episode-poster-small">
                                            {episode.posterUrl ? (
                                                <LazyImage src={episode.posterUrl} alt={episode.title} />
                                            ) : (
                                                <div className="episode-poster-placeholder">
                                                    {episode.episodeNumber !== undefined ? `E${episode.episodeNumber}` : 'E?'}
                                                </div>
                                            )}
                                        </div>
                                        <div className="episode-info-small">
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
                            ↑ ↓ select • Enter play • Back seasons
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}

export default ShowDetailModal
