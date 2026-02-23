import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
    close: () => ipcRenderer.invoke('app:close'),

    playerApi: {
        launch: (player: string, filePath: string, startPosition?: number, jellyfinItemId?: string) =>
            ipcRenderer.invoke('player:launch', player, filePath, startPosition, jellyfinItemId),
        play: () => ipcRenderer.invoke('player:play'),
        pause: () => ipcRenderer.invoke('player:pause'),
        stop: () => ipcRenderer.invoke('player:stop'),
        seek: (position: number) => ipcRenderer.invoke('player:seek', position),
        selectAudio: (index: number) => ipcRenderer.invoke('player:audio-select', index),
        selectSubtitle: (index: number) => ipcRenderer.invoke('player:subtitle-select', index),
    },

    jellyfinApi: {
        authenticate: (username: string, password: string) =>
            ipcRenderer.invoke('jellyfin:authenticate', username, password),
        getMovies: () => ipcRenderer.invoke('jellyfin:get-movies'),
        getSeries: () => ipcRenderer.invoke('jellyfin:get-series'),
        getSeasons: (seriesId: string) => ipcRenderer.invoke('jellyfin:get-seasons', seriesId),
        getEpisodes: (seriesId: string, seasonId: string) =>
            ipcRenderer.invoke('jellyfin:get-episodes', seriesId, seasonId),
        reportProgress: (itemId: string, positionTicks: number) =>
            ipcRenderer.invoke('jellyfin:report-progress', itemId, positionTicks),
        reportStopped: (itemId: string, positionTicks: number) =>
            ipcRenderer.invoke('jellyfin:report-stopped', itemId, positionTicks),
    },

    configApi: {
        get: () => ipcRenderer.invoke('config:get'),
        set: (config: Record<string, any>) => ipcRenderer.invoke('config:set', config),
    },

    fileApi: {
        getLocalImagePath: (itemId: string) => ipcRenderer.invoke('file:get-local-image', itemId),
    },
})
