export const CONTINUE_WATCHING_THRESHOLD_PERCENT = 90

export interface PlaybackProgressLike {
    playedPercentage?: number
    resumePosition?: number
    duration?: number
}

export function getPlaybackProgressPercent(item: PlaybackProgressLike): number {
    if (typeof item.playedPercentage === 'number' && item.playedPercentage > 0) {
        return item.playedPercentage
    }

    if (item.duration && item.duration > 0 && item.resumePosition && item.resumePosition > 0) {
        return Math.min(100, (item.resumePosition / item.duration) * 100)
    }

    return 0
}

export function isEffectivelyFinished(item: PlaybackProgressLike, thresholdPercent = CONTINUE_WATCHING_THRESHOLD_PERCENT): boolean {
    return getPlaybackProgressPercent(item) >= thresholdPercent
}
