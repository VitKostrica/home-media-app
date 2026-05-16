import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

type FocusPane = 'showActions' | 'seasons' | 'seasonActions' | 'episodes'

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

function CheckIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" />
        </svg>
    )
}

function ResetIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7v5h5" />
            <path d="M20 17a8 8 0 0 1-13.7-5.6L4 12" />
            <path d="M20 12A8 8 0 0 0 6.7 6.1" />
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
    const [seasonActionIndex, setSeasonActionIndex] = useState(0)
    const [actionBusy, setActionBusy] = useState(false)
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

    const loadSeason = useCallback(
        async (
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
        },
        [show.id]
    )

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

    const handleSeasonActivate = useCallback(
        async (seasonIndex: number, focusEpisodes: boolean) => {
            const season = seasons[seasonIndex]
            if (!season) {
                return
            }

            await loadSeason(season, seasonIndex, {
                focusPane: focusEpisodes ? 'episodes' : 'seasons',
            })
        },
        [loadSeason, seasons]
    )

    const reloadSelectedSeason = useCallback(async () => {
        if (!selectedSeason) {
            return
        }

        await loadSeason(selectedSeason, selectedSeasonIndex, {
            focusPane,
        })
    }, [focusPane, loadSeason, selectedSeason, selectedSeasonIndex])

    const markEpisodeList = useCallback(async (episodeList: Episode[], watched: boolean) => {
        const api = window.electron?.jellyfinApi
        if (!api || episodeList.length === 0) {
            return
        }

        await Promise.all(
            episodeList.map((episode) =>
                watched ? api.markPlayed(episode.id) : api.markUnplayed(episode.id)
            )
        )
    }, [])

    const resetShow = useCallback(async () => {
        if (actionBusy || seasons.length === 0) {
            return
        }

        setActionBusy(true)
        try {
            const api = window.electron?.jellyfinApi
            if (!api) {
                return
            }

            const seasonEpisodeLists = await Promise.all(
                seasons.map((season) => api.getEpisodes(show.id, season.id))
            )
            await markEpisodeList(seasonEpisodeLists.flat(), false)
            await reloadSelectedSeason()
        } catch (err) {
            console.error('Failed to reset show:', err)
        } finally {
            setActionBusy(false)
        }
    }, [actionBusy, markEpisodeList, reloadSelectedSeason, seasons, show.id])

    const resetSeason = useCallback(async () => {
        if (actionBusy || episodes.length === 0) {
            return
        }

        setActionBusy(true)
        try {
            await markEpisodeList(episodes, false)
            await reloadSelectedSeason()
        } catch (err) {
            console.error('Failed to reset season:', err)
        } finally {
            setActionBusy(false)
        }
    }, [actionBusy, episodes, markEpisodeList, reloadSelectedSeason])

    const markSeasonSeen = useCallback(async () => {
        if (actionBusy || episodes.length === 0) {
            return
        }

        setActionBusy(true)
        try {
            await markEpisodeList(episodes, true)
            await reloadSelectedSeason()
        } catch (err) {
            console.error('Failed to mark season seen:', err)
        } finally {
            setActionBusy(false)
        }
    }, [actionBusy, episodes, markEpisodeList, reloadSelectedSeason])

    const seasonActions = useMemo(
        () => [
            {
                key: 'mark-season-seen',
                label: 'Mark season seen',
                icon: CheckIcon,
                disabled: actionBusy || loadingEpisodes || episodes.length === 0,
                onSelect: markSeasonSeen,
            },
            {
                key: 'reset-season',
                label: 'Reset season',
                icon: ResetIcon,
                disabled: actionBusy || loadingEpisodes || episodes.length === 0,
                onSelect: resetSeason,
            },
        ],
        [actionBusy, episodes.length, loadingEpisodes, markSeasonSeen, resetSeason]
    )

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (matches(e.key, 'back')) {
            e.preventDefault()
            onClose()
            return
        }

        if (actionBusy) {
            return
        }

        if (focusPane === 'showActions') {
            if (matches(e.key, 'down')) {
                e.preventDefault()
                setFocusPane('seasons')
                return
            }

            if (matches(e.key, 'right')) {
                e.preventDefault()
                if (selectedSeason) {
                    setFocusPane('seasonActions')
                }
                return
            }

            if (matches(e.key, 'confirm')) {
                e.preventDefault()
                void resetShow()
                return
            }
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
                if (selectedSeasonIndex === 0) {
                    setFocusPane('showActions')
                    return
                }

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
                if (seasonActions.length > 0) {
                    setFocusPane('seasonActions')
                    setSeasonActionIndex(0)
                } else if (episodes.length > 0) {
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

        if (focusPane === 'seasonActions') {
            if (matches(e.key, 'left')) {
                e.preventDefault()
                setFocusPane('seasons')
                return
            }

            if (matches(e.key, 'right')) {
                e.preventDefault()
                setSeasonActionIndex((prev) => clampIndex(prev + 1, seasonActions.length))
                return
            }

            if (matches(e.key, 'up')) {
                e.preventDefault()
                setFocusPane('showActions')
                return
            }

            if (matches(e.key, 'down')) {
                e.preventDefault()
                if (episodes.length > 0) {
                    setFocusPane('episodes')
                }
                return
            }

            if (matches(e.key, 'confirm')) {
                e.preventDefault()
                const action = seasonActions[seasonActionIndex]
                if (action && !action.disabled) {
                    void action.onSelect()
                }
                return
            }
        }

        if (matches(e.key, 'down')) {
            e.preventDefault()
            setSelectedEpisodeIndex((prev) => clampIndex(prev + 1, episodes.length))
            return
        }

        if (matches(e.key, 'up')) {
            e.preventDefault()
            if (selectedEpisodeIndex === 0) {
                setFocusPane('seasonActions')
                return
            }

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
    }, [
        actionBusy,
        episodes,
        focusPane,
        handleSeasonActivate,
        markSeasonSeen,
        matches,
        onClose,
        playEpisode,
        resetSeason,
        resetShow,
        seasonActionIndex,
        seasonActions,
        seasons,
        selectedEpisodeIndex,
        selectedSeason,
        selectedSeasonIndex,
    ])

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleKeyDown])

    return (
        <div
            className="show-detail-modal"
            onClick={onClose}
            tabIndex={0}
            autoFocus
        >
            <div className="show-detail-card" onClick={(event) => event.stopPropagation()}>
                <div className="show-detail-view">
                    <div className="show-header">
                        <div className="show-detail-info">
                            <h2 className="show-detail-title">
                                {show.title}
                                {show.year && <span className="show-detail-year"> ({show.year})</span>}
                            </h2>

                            {show.overview && (
                                <p className="show-detail-overview">{show.overview}</p>
                            )}

                            <p className="show-detail-nav-hint">
                                Arrows navigate • Enter select/play • Back close
                            </p>
                        </div>

                        <div className="show-actions">
                            <button
                                className={`show-action-button ${focusPane === 'showActions' ? 'focused' : ''}`}
                                onClick={() => { void resetShow() }}
                                disabled={actionBusy || seasons.length === 0}
                            >
                                <ResetIcon />
                                <span>Reset show</span>
                            </button>
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

                            <div className="season-action-row" role="toolbar" aria-label="Season actions">
                                {seasonActions.map((action, index) => {
                                    const ActionIcon = action.icon
                                    return (
                                        <button
                                            key={action.key}
                                            className={`season-action-button ${
                                                focusPane === 'seasonActions' && seasonActionIndex === index ? 'focused' : ''
                                            }`}
                                            onClick={() => {
                                                setFocusPane('seasonActions')
                                                setSeasonActionIndex(index)
                                                void action.onSelect()
                                            }}
                                            disabled={action.disabled}
                                        >
                                            <ActionIcon />
                                            <span>{action.label}</span>
                                        </button>
                                    )
                                })}
                            </div>

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
