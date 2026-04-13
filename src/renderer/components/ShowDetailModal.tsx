import React, { useEffect, useRef, useState } from 'react'
import '../styles/ShowDetailModal.css'
import LazyImage from './LazyImage'
import { useKeybindings } from '../hooks/useKeybindings'

interface Episode {
    id: string
    title: string
    episodeNumber?: number
    posterUrl?: string
    overview?: string
    duration?: number
    communityRating?: number
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
        initialSeasonNumber?: number
        initialEpisodeNumber?: number
    }
    onClose: () => void
    onPlay: (episode: Episode) => void | Promise<void>
}

type FocusPane = 'seasons' | 'episodes'

function formatDuration(totalSeconds?: number): string {
    if (!totalSeconds || totalSeconds <= 0) {
        return ''
    }

    const minutes = Math.round(totalSeconds / 60)
    return `${minutes}m`
}

function clampIndex(index: number, length: number): number {
    if (length <= 0) {
        return 0
    }

    return Math.max(0, Math.min(index, length - 1))
}

function InfoIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 10v6" />
            <path d="M12 7.5h.01" />
        </svg>
    )
}

function CheckIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" />
        </svg>
    )
}

function HeartIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21s-7-4.4-9.2-8.7C1 8.8 3.2 6 6.3 6c1.8 0 3.3 1 4.1 2.2C11.2 7 12.7 6 14.5 6c3.1 0 5.3 2.8 3.5 6.3C19 16.6 12 21 12 21z" />
        </svg>
    )
}

function MoreIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="5" r="1.7" />
            <circle cx="12" cy="12" r="1.7" />
            <circle cx="12" cy="19" r="1.7" />
        </svg>
    )
}

const ShowDetailModal: React.FC<ShowDetailModalProps> = ({ show, onClose, onPlay }) => {
    const [seasons, setSeasons] = useState<Season[]>([])
    const [episodes, setEpisodes] = useState<Episode[]>([])
    const [selectedSeason, setSelectedSeason] = useState<Season | null>(null)
    const [selectedSeasonIndex, setSelectedSeasonIndex] = useState(0)
    const [selectedEpisodeIndex, setSelectedEpisodeIndex] = useState(0)
    const [loadingSeasons, setLoadingSeasons] = useState(false)
    const [loadingEpisodes, setLoadingEpisodes] = useState(false)
    const [focusPane, setFocusPane] = useState<FocusPane>('seasons')
    const { matches } = useKeybindings()
    const loadRequestRef = useRef(0)

    const playEpisode = async (episode: Episode) => {
        try {
            const api = window.electron?.jellyfinApi
            let playable = episode

            if (!playable.filePath && api) {
                const details = await api.getItemDetails(episode.id)
                if (details) {
                    playable = {
                        ...episode,
                        ...details,
                    }
                }
            }

            if (!playable.filePath) {
                alert('File path not available')
                return
            }

            await onPlay(playable)
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to play episode'
            alert(`Error: ${message}`)
        }
    }

    const loadSeason = async (
        season: Season,
        seasonIndex: number,
        options?: { focusPane?: FocusPane; episodeNumber?: number }
    ) => {
        const requestId = ++loadRequestRef.current
        setLoadingEpisodes(true)
        setSelectedSeasonIndex(seasonIndex)
        setSelectedSeason(season)
        setSelectedEpisodeIndex(0)
        setEpisodes([])

        try {
            const [seasonDetails, episodeResponse] = await Promise.all([
                window.electron.jellyfinApi.getItemDetails(season.id),
                window.electron.jellyfinApi.getEpisodes(show.id, season.id),
            ])

            if (requestId !== loadRequestRef.current) {
                return
            }

            const nextSeason: Season = {
                ...season,
                title: seasonDetails?.title || season.title,
                overview: seasonDetails?.overview ?? season.overview,
                seasonNumber: seasonDetails?.seasonNumber ?? season.seasonNumber,
                posterUrl: seasonDetails?.posterUrl ?? season.posterUrl,
            }

            const targetEpisodeIndex = options?.episodeNumber !== undefined
                ? episodeResponse.findIndex((episode) => episode.episodeNumber === options.episodeNumber)
                : 0

            setSelectedSeason(nextSeason)
            setSelectedSeasonIndex(seasonIndex)
            setEpisodes(episodeResponse)
            setSelectedEpisodeIndex(clampIndex(targetEpisodeIndex >= 0 ? targetEpisodeIndex : 0, episodeResponse.length))

            if (options?.focusPane) {
                setFocusPane(options.focusPane)
            }
        } catch (err) {
            console.error('Failed to fetch season details:', err)
        } finally {
            if (requestId === loadRequestRef.current) {
                setLoadingEpisodes(false)
            }
        }
    }

    useEffect(() => {
        let cancelled = false

        const fetchSeasons = async () => {
            try {
                setLoadingSeasons(true)
                const response = await window.electron.jellyfinApi.getSeasons(show.id)

                if (cancelled) {
                    return
                }

                setSeasons(response)

                if (response.length === 0) {
                    setSelectedSeason(null)
                    setEpisodes([])
                    setSelectedSeasonIndex(0)
                    setSelectedEpisodeIndex(0)
                    return
                }

                const preferredSeasonIndex = show.initialSeasonNumber !== undefined
                    ? response.findIndex((season) => season.seasonNumber === show.initialSeasonNumber)
                    : 0
                const safeSeasonIndex = preferredSeasonIndex >= 0 ? preferredSeasonIndex : 0
                const preferredSeason = response[safeSeasonIndex]

                await loadSeason(preferredSeason, safeSeasonIndex, {
                    focusPane: show.initialSeasonNumber !== undefined ? 'episodes' : 'seasons',
                    episodeNumber: show.initialEpisodeNumber,
                })
            } catch (err) {
                console.error('Failed to fetch seasons:', err)
            } finally {
                if (!cancelled) {
                    setLoadingSeasons(false)
                }
            }
        }

        void fetchSeasons()

        return () => {
            cancelled = true
            loadRequestRef.current += 1
        }
    }, [loadSeason, show.id, show.initialEpisodeNumber, show.initialSeasonNumber])

    useEffect(() => {
        const focusedSelector = focusPane === 'seasons' ? '.season-card.focused' : '.episode-card.focused'
        const focused = document.querySelector(focusedSelector)
        if (focused instanceof HTMLElement) {
            focused.scrollIntoView({ behavior: 'auto', block: 'nearest' })
        }
    }, [focusPane, selectedEpisodeIndex, selectedSeasonIndex])

    const handleSeasonActivate = async (seasonIndex: number, focusEpisodes: boolean) => {
        const season = seasons[seasonIndex]
        if (!season) {
            return
        }

        await loadSeason(season, seasonIndex, {
            focusPane: focusEpisodes ? 'episodes' : 'seasons',
        })
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (matches(e.key, 'back')) {
            onClose()
            return
        }

        if (focusPane === 'seasons') {
            if (matches(e.key, 'down')) {
                e.preventDefault()
                const nextIndex = clampIndex(selectedSeasonIndex + 1, seasons.length)
                if (nextIndex !== selectedSeasonIndex && seasons[nextIndex]) {
                    void loadSeason(seasons[nextIndex], nextIndex, {
                        focusPane: 'seasons',
                    })
                }
                return
            }

            if (matches(e.key, 'up')) {
                e.preventDefault()
                const nextIndex = clampIndex(selectedSeasonIndex - 1, seasons.length)
                if (nextIndex !== selectedSeasonIndex && seasons[nextIndex]) {
                    void loadSeason(seasons[nextIndex], nextIndex, {
                        focusPane: 'seasons',
                    })
                }
                return
            }

            if (matches(e.key, 'right')) {
                e.preventDefault()
                if (episodes.length > 0) {
                    setFocusPane('episodes')
                }
                return
            }

            if (matches(e.key, 'confirm')) {
                e.preventDefault()
                const season = seasons[selectedSeasonIndex]
                if (season) {
                    void handleSeasonActivate(selectedSeasonIndex, true)
                }
            }
            return
        }

        if (matches(e.key, 'down')) {
            e.preventDefault()
            setSelectedEpisodeIndex((prev) => clampIndex(prev + 1, episodes.length))
            return
        }

        if (matches(e.key, 'up')) {
            e.preventDefault()
            setSelectedEpisodeIndex((prev) => clampIndex(prev - 1, episodes.length))
            return
        }

        if (matches(e.key, 'left')) {
            e.preventDefault()
            setFocusPane('seasons')
            return
        }

        if (matches(e.key, 'confirm')) {
            e.preventDefault()
            const episode = episodes[selectedEpisodeIndex]
            if (episode) {
                void playEpisode(episode)
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
            <div className="show-detail-card" onClick={(event) => event.stopPropagation()}>
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

                            <p className="show-detail-nav-hint">
                                ↑ ↓ seasons / episodes • ← → switch pane • Enter play • Back close
                            </p>
                        </div>
                    </div>

                    <div className="show-content-split">
                        <aside className="season-panel">
                            <div className="panel-header">
                                <h3 className="panel-title">Seasons</h3>
                                <span className="panel-meta">{seasons.length} items</span>
                            </div>

                            {loadingSeasons ? (
                                <p className="panel-empty">Loading seasons...</p>
                            ) : seasons.length === 0 ? (
                                <p className="panel-empty">No seasons found</p>
                            ) : (
                                <div className="seasons-list">
                                    {seasons.map((season, index) => (
                                        <div
                                            key={season.id}
                                            className={`season-card ${index === selectedSeasonIndex && focusPane === 'seasons' ? 'focused' : ''}`}
                                            onClick={() => {
                                                setSelectedSeasonIndex(index)
                                                void handleSeasonActivate(index, true)
                                            }}
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
                                                <p className="season-title">
                                                    {season.seasonNumber !== undefined ? `Season ${season.seasonNumber}` : season.title}
                                                </p>
                                                {season.overview && (
                                                    <p className="season-description">{season.overview}</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </aside>

                        <section className="episode-panel">
                            <div className="panel-header">
                                <div>
                                    <h3 className="panel-title">
                                        {selectedSeason?.title || 'Episodes'}
                                    </h3>
                                    {selectedSeason?.seasonNumber !== undefined && (
                                        <p className="panel-subtitle">
                                            Season {selectedSeason.seasonNumber}
                                        </p>
                                    )}
                                </div>
                                <span className="panel-meta">{episodes.length} items</span>
                            </div>

                            {selectedSeason?.overview && (
                                <div className="selected-season-summary">
                                    <p className="selected-season-overview">
                                        {selectedSeason.overview}
                                    </p>
                                </div>
                            )}

                            {loadingEpisodes ? (
                                <p className="panel-empty">Loading episodes...</p>
                            ) : episodes.length === 0 ? (
                                <p className="panel-empty">No episodes found</p>
                            ) : (
                                <div className="episodes-list">
                                    {episodes.map((episode, index) => (
                                        <div
                                            key={episode.id}
                                            className={`episode-card ${
                                                index === selectedEpisodeIndex && focusPane === 'episodes' ? 'focused' : ''
                                            }`}
                                            onClick={() => {
                                                setSelectedEpisodeIndex(index)
                                                void playEpisode(episode)
                                            }}
                                        >
                                            <div className="episode-poster">
                                                {episode.posterUrl ? (
                                                    <LazyImage src={episode.posterUrl} alt={episode.title} />
                                                ) : (
                                                    <div className="episode-poster-placeholder">
                                                        {episode.episodeNumber !== undefined ? `E${episode.episodeNumber}` : 'E?'}
                                                    </div>
                                                )}
                                                <div className="episode-play-badge" aria-hidden="true">
                                                    <span>▶</span>
                                                </div>
                                                {episode.watched && (
                                                    <div className="episode-watched-chip" aria-hidden="true">
                                                        <CheckIcon />
                                                    </div>
                                                )}
                                                {episode.playedPercentage && episode.playedPercentage > 0 && !episode.watched && (
                                                    <div className="episode-progress-bar">
                                                        <div
                                                            className="episode-progress-fill"
                                                            style={{ width: `${episode.playedPercentage}%` }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="episode-info">
                                                <p className="episode-label">
                                                    {episode.episodeNumber !== undefined
                                                        ? `${episode.episodeNumber}. ${episode.title || 'Untitled'}`
                                                        : `${index + 1}. ${episode.title || 'Untitled'}`}
                                                </p>
                                                <div className="episode-meta">
                                                    {episode.duration && (
                                                        <span>{formatDuration(episode.duration)}</span>
                                                    )}
                                                    {episode.communityRating !== undefined && (
                                                        <span className="episode-rating">
                                                            <span className="rating-star">★</span>
                                                            {episode.communityRating.toFixed(1)}
                                                        </span>
                                                    )}
                                                    {episode.resumePosition && episode.resumePosition > 0 && !episode.watched && (
                                                        <span className="episode-status">Resume</span>
                                                    )}
                                                </div>
                                                {episode.overview && (
                                                    <p className="episode-description">{episode.overview}</p>
                                                )}
                                            </div>
                                            <div className="episode-actions" aria-hidden="true">
                                                <span className="episode-action-icon">
                                                    <InfoIcon />
                                                </span>
                                                <span className="episode-action-icon">
                                                    <CheckIcon />
                                                </span>
                                                <span className="episode-action-icon">
                                                    <HeartIcon />
                                                </span>
                                                <span className="episode-action-icon">
                                                    <MoreIcon />
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ShowDetailModal
