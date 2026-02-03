import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
    close: () => ipcRenderer.invoke('app:close'),
    playerApi: {
        play: () => ipcRenderer.invoke('player:play'),
        pause: () => ipcRenderer.invoke('player:pause'),
        stop: () => ipcRenderer.invoke('player:stop'),
        seek: (position: number) => ipcRenderer.invoke('player:seek', position),
        selectAudio: (index: number) => ipcRenderer.invoke('player:audio-select', index),
        selectSubtitle: (index: number) => ipcRenderer.invoke('player:subtitle-select', index),
    },
    jellyfinApi: {
        getLibrary: () => ipcRenderer.invoke('jellyfin:get-library'),
        updateProgress: (itemId: string, progress: number) =>
            ipcRenderer.invoke('jellyfin:update-progress', itemId, progress),
    },
})
