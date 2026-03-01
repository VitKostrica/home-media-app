declare global {
    interface Window {
        electron: {
            close: () => void
            playerApi: {
                launch: (player: string, filePath: string, startPosition?: number, jellyfinItemId?: string, durationSec?: number) => Promise<void>
                play: () => Promise<void>
                pause: () => Promise<void>
                stop: () => Promise<void>
                seek: (position: number) => Promise<void>
                selectAudio: (index: number) => Promise<void>
                selectSubtitle: (index: number) => Promise<void>
            }
            jellyfinApi: {
                authenticate: (username: string, password: string) => Promise<any>
                getMovies: () => Promise<any>
                getSeries: () => Promise<any>
                getSeasons: (seriesId: string) => Promise<any>
                getEpisodes: (seriesId: string, seasonId: string) => Promise<any>
                getResumeItems: () => Promise<any>
                getNextUpItems: () => Promise<any>
                getPlaybackInfo: (itemId: string) => Promise<{ streamUrl?: string; mediaSourceId?: string }>
                reportPlaybackStart: (itemId: string, positionTicks: number) => Promise<void>
                reportProgress: (itemId: string, positionTicks: number) => Promise<void>
                reportStopped: (itemId: string, positionTicks: number) => Promise<void>
            }
            configApi: {
                get: () => Promise<any>
                set: (config: Record<string, any>) => Promise<void>
            }
            fileApi: {
                getLocalImagePath: (itemId: string) => Promise<string>
            }
            on: (channel: string, listener: (...args: any[]) => void) => void
            off: (channel: string, listener: (...args: any[]) => void) => void
        }
    }
}

export { }
