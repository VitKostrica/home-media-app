// Shared types for the application

export interface MediaItem {
    id: string
    title: string
    type: 'movie' | 'episode'
    thumbnail?: string
    posterUrl?: string
    overview?: string
    duration?: number
    watched: boolean
    resumePosition?: number
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

export interface ElectronAPI {
    playerApi: {
        play: () => Promise<void>
        pause: () => Promise<void>
        stop: () => Promise<void>
        seek: (position: number) => Promise<void>
        selectAudio: (index: number) => Promise<void>
        selectSubtitle: (index: number) => Promise<void>
    }
    jellyfinApi: {
        getLibrary: () => Promise<MediaItem[]>
        updateProgress: (itemId: string, progress: number) => Promise<void>
    }
}

declare global {
    interface Window {
        electron: ElectronAPI
    }
}
