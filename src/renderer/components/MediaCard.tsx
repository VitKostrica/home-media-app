import React, { useState } from 'react'
import '../styles/MediaCard.css'
import LazyImage from './LazyImage'

interface MediaCardItem {
    id: string
    title: string
    posterUrl?: string
    posterUrlFallback?: string
    watched: boolean
    playedPercentage?: number
    year?: number
    type: string
}

interface MediaCardProps {
    item: MediaCardItem
    isFocused?: boolean
    onSelect?: () => void
    showProgress?: boolean
}

const MediaCard: React.FC<MediaCardProps> = ({ item, isFocused = false, onSelect, showProgress = true }) => {
    const [imgFailed, setImgFailed] = useState(false)
    const [useFallback, setUseFallback] = useState(false)

    // Determine which image URL to use
    const imageUrl = useFallback ? item.posterUrlFallback : item.posterUrl

    // Handle image load failure - try fallback if available
    const handleImageError = () => {
        if (!useFallback && item.posterUrlFallback) {
            setUseFallback(true)
        } else {
            setImgFailed(true)
        }
    }

    return (
        <div
            className={`media-card ${isFocused ? 'focused' : ''}`}
            onClick={onSelect}
        >
            <div className="media-card-poster">
                {imageUrl && !imgFailed ? (
                    <LazyImage
                        src={imageUrl}
                        alt={item.title}
                        onError={handleImageError}
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
                <h3 className="media-card-title">{item.title}</h3>
                {item.year && (
                    <span className="media-card-year">{item.year}</span>
                )}
            </div>
        </div>
    )
}

export default MediaCard
