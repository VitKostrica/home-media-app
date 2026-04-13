import React, { useState, useEffect } from 'react'
import '../styles/ShowDetailModal.css'
import LazyImage from './LazyImage'
import { useKeybindings } from '../hooks/useKeybindings'
import { isEffectivelyFinished } from '../utils/playbackProgress'

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
    onPlay: (episode: Episode) => void
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
    const { matches } = useKeybindings()

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
                const resumeEp = eps.find(
                    (e: Episode) => e.resumePosition && e.resumePosition > 0 && !isEffectivelyFinished(e)
                )
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

    const handleSeasonSelect = async (season: Season) => {
        try {
            setLoading(true)
            const [seasonDetails, episodeResponse] = await Promise.all([
                window.electron.jellyfinApi.getItemDetails(season.id),
                window.electron.jellyfinApi.getEpisodes(show.id, season.id),
            ])

            setSelectedSeason({
                ...season,
                title: seasonDetails?.title || season.title,
                overview: seasonDetails?.overview ?? season.overview,
                seasonNumber: seasonDetails?.seasonNumber ?? season.seasonNumber,
                posterUrl: seasonDetails?.posterUrl ?? season.posterUrl,
            })
            setEpisodes(episodeResponse)
            setSelectedIndex(0)
            setViewMode('episodes')
        } catch (err) {
            console.error('Failed to fetch season details:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (matches(e.key, 'back')) {
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
            if (matches(e.key, 'down')) {
                setSelectedIndex(Math.min(selectedIndex + rowSize, seasons.length - 1))
                e.preventDefault()
            } else if (matches(e.key, 'up')) {
                setSelectedIndex(Math.max(selectedIndex - rowSize, 0))
                e.preventDefault()
            } else if (matches(e.key, 'right')) {
                setSelectedIndex(Math.min(selectedIndex + 1, seasons.length - 1))
                e.preventDefault()
            } else if (matches(e.key, 'left')) {
                setSelectedIndex(Math.max(selectedIndex - 1, 0))
                e.preventDefault()
            } else if (matches(e.key, 'confirm')) {
                handleSeasonSelect(seasons[selectedIndex])
                e.preventDefault()
            }
        } else if (viewMode === 'episodes') {
            const rowSize = columnCount
            if (matches(e.key, 'down')) {
                setSelectedIndex(Math.min(selectedIndex + rowSize, episodes.length - 1))
                e.preventDefault()
            } else if (matches(e.key, 'up')) {
                setSelectedIndex(Math.max(selectedIndex - rowSize, 0))
                e.preventDefault()
            } else if (matches(e.key, 'right')) {
                setSelectedIndex(Math.min(selectedIndex + 1, episodes.length - 1))
                e.preventDefault()
            } else if (matches(e.key, 'left')) {
                setSelectedIndex(Math.max(selectedIndex - 1, 0))
                e.preventDefault()
            } else if (matches(e.key, 'confirm')) {
                const episode = episodes[selectedIndex]
                onPlay(episode)
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
                                                onPlay(continueWatchingEpisode)
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
                                            onClick={() => handleSeasonSelect(season)}
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

                        {selectedSeason && (
                            <div className="selected-season-summary">
                                {selectedSeason.seasonNumber !== undefined && (
                                    <span className="selected-season-number">
                                        Season {selectedSeason.seasonNumber}
                                    </span>
                                )}
                                {selectedSeason.overview && (
                                    <p className="selected-season-overview">
                                        {selectedSeason.overview}
                                    </p>
                                )}
                            </div>
                        )}

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
                                        onClick={() => onPlay(episode)}
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
                                            <p className="episode-label">
                                                Episode {episode.episodeNumber ?? idx + 1} - {episode.title || 'Untitled'}
                                            </p>
                                            {episode.overview && (
                                                <p className="episode-description">{episode.overview}</p>
                                            )}
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
