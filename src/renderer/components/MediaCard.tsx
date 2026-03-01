import React, { useState } from 'react'
import '../styles/MediaCard.css'
import LazyImage from './LazyImage'

interface MediaCardItem {
    id: string
    title: string
    posterUrl?: string
    watched: boolean
    playedPercentage?: number
    year?: number
    type: string
    seriesName?: string
    seasonNumber?: number
    episodeNumber?: number
}

interface MediaCardProps {
    item: MediaCardItem
    isFocused?: boolean
    onSelect?: () => void
    showProgress?: boolean
}

const MediaCard: React.FC<MediaCardProps> = ({ item, isFocused = false, onSelect, showProgress = true }) => {
    const [imgFailed, setImgFailed] = useState(false)
    const isEpisode = item.type === 'episode' && !!item.seriesName
    const episodeCode =
        typeof item.seasonNumber === 'number' && typeof item.episodeNumber === 'number'
            ? `S${String(item.seasonNumber).padStart(2, '0')}E${String(item.episodeNumber).padStart(2, '0')}`
            : ''

    return (
        <div
            className={`media-card ${isFocused ? 'focused' : ''}`}
            onClick={onSelect}
        >
            <div className="media-card-poster">
                {item.posterUrl && !imgFailed ? (
                    <LazyImage
                        src={item.posterUrl}
                        alt={item.title}
                        onError={() => setImgFailed(true)}
                    />
                ) : (
                    <div className="media-card-placeholder">
                        <span className="placeholder-letter">
                            {item.title.charAt(0).toUpperCase()}
                        </span>
                    </div>
                )}

                {/* Watched checkmark */}
                {item.watched && (
                    <div className="media-card-watched">✓</div>
                )}

                {/* Progress bar overlay at bottom of poster */}
                {showProgress && (item.playedPercentage || 0) > 0 && !item.watched && (
                    <div className="media-card-progress">
                        <div
                            className="media-card-progress-fill"
                            style={{ width: `${item.playedPercentage}%` }}
                        />
                    </div>
                )}
            </div>

            <div className="media-card-info">
                {isEpisode ? (
                    <>
                        <h3 className="media-card-title">{item.seriesName}</h3>
                        <p className="media-card-subtitle">
                            {episodeCode ? `${episodeCode} ` : ''}{item.title}
                        </p>
                    </>
                ) : (
                    <h3 className="media-card-title">{item.title}</h3>
                )}
                {item.year && (
                    <span className="media-card-year">{item.year}</span>
                )}
            </div>
        </div>
    )
}

export default MediaCard
