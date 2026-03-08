// Shared types for the application
import type { KeybindingsConfig } from './keybindings'

export interface MediaItem {
    id: string
    title: string
    type: 'movie' | 'series' | 'episode'
    year?: number
    posterUrl?: string
    backdropUrl?: string
    overview?: string
    duration?: number       // in seconds
    watched: boolean
    resumePosition?: number // in seconds
    playedPercentage?: number
    filePath?: string
    // Series/episode specific
    seriesName?: string
    seasonName?: string
    seasonNumber?: number
    episodeNumber?: number
}

export interface AudioTrack {
    index: number
    title: string
    language?: string
    codec?: string
}

export interface SubtitleTrack {
    index: number
    title: string
    language?: string
    isForced?: boolean
    isDefault?: boolean
}

export interface PlaybackState {
    isPlaying: boolean
    currentTime: number
    duration: number
    volume: number
    audioTrack: number
    subtitleTrack: number
    availableAudio: AudioTrack[]
    availableSubtitles: SubtitleTrack[]
}

export type PlayerType = 'mpv' | 'vlc'

export type AppScreen = 'home' | 'media-app'

export interface AppConfig {
    jellyfinUrl: string
    jellyfinApiKey: string
    jellyfinUserId: string
    jellyfinUsername: string
    mediaBasePath: string
    moviesBasePath: string
    showsBasePath: string
    defaultPlayer: PlayerType
    keybindings: KeybindingsConfig
}

export interface ElectronAPI {
    close: () => Promise<void>
    restart: () => Promise<void>
    playerApi: {
        launch: (player: PlayerType, filePath: string, startPosition?: number, jellyfinItemId?: string, durationSec?: number) => Promise<{ success: boolean; error?: string }>
        play: () => Promise<void>
        pause: () => Promise<void>
        stop: () => Promise<void>
        seek: (position: number) => Promise<void>
        selectAudio: (index: number) => Promise<void>
        selectSubtitle: (index: number) => Promise<void>
    }
    jellyfinApi: {
        authenticate: (username: string, password: string) => Promise<{ success: boolean; error?: string }>
        getMovies: () => Promise<MediaItem[]>
        getSeries: () => Promise<MediaItem[]>
        getSeasons: (seriesId: string) => Promise<MediaItem[]>
        getEpisodes: (seriesId: string, seasonId: string) => Promise<MediaItem[]>
        getResumeItems: () => Promise<MediaItem[]>
        getNextUpItems: () => Promise<MediaItem[]>
        getPlaybackInfo: (itemId: string) => Promise<{ streamUrl?: string; mediaSourceId?: string }>
        reportPlaybackStart: (itemId: string, positionTicks: number) => Promise<void>
        reportProgress: (itemId: string, positionTicks: number) => Promise<void>
        reportStopped: (itemId: string, positionTicks: number) => Promise<void>
    }
    configApi: {
        get: () => Promise<AppConfig>
        set: (config: Partial<AppConfig>) => Promise<void>
    }
    on: (channel: string, listener: (...args: any[]) => void) => void
    off: (channel: string, listener: (...args: any[]) => void) => void
}

declare global {
    interface Window {
        electron: ElectronAPI
    }
}
