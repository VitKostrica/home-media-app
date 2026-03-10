import React, { useState, useEffect } from 'react'
import '../styles/HomeScreen.css'
import Tile from '../components/Tile'
import { useKeybindings } from '../hooks/useKeybindings'
import type { AppConfig } from '../../types'
import type { KeybindingAction } from '../../types/keybindings'

interface AppTile {
    id: string
    title: string
    icon: string
    description: string
}

const HOME_TILES: AppTile[] = [
    {
        id: 'custom-media',
        title: 'Custom Media',
        icon: '/app-icons/jellyfin.png',
        description: 'Local movies & shows',
    },
    {
        id: 'youtube',
        title: 'YouTube',
        icon: '/app-icons/youtube.png',
        description: 'Online videos',
    },
    {
        id: 'disney-plus',
        title: 'Disney+',
        icon: '/app-icons/disney.png',
        description: 'Disney content',
    },
    {
        id: 'prime-video',
        title: 'Prime Video',
        icon: '/app-icons/primevideo.png',
        description: 'Prime content',
    },
    {
        id: 'sweet-tv',
        title: 'Sweet.tv',
        icon: '/app-icons/sweet.png',
        description: 'Sweet.tv service',
    },
    {
        id: 'jellyfin',
        title: 'Jellyfin',
        icon: '/app-icons/jellyfin.png',
        description: 'Personal media server',
    },
]

interface HomeScreenProps {
    onNavigate?: (screen: string) => void
}

const HomeScreen: React.FC<HomeScreenProps> = ({ onNavigate }) => {
    const [focusedIndex, setFocusedIndex] = useState(0)
    const [showSettings, setShowSettings] = useState(false)
    const [isSavingSettings, setIsSavingSettings] = useState(false)
    const [settingsMessage, setSettingsMessage] = useState<string | null>(null)
    const [moviesBasePath, setMoviesBasePath] = useState('')
    const [showsBasePath, setShowsBasePath] = useState('')
    const [keybindingInputs, setKeybindingInputs] = useState<Record<KeybindingAction, string>>({
        up: '',
        down: '',
        left: '',
        right: '',
        confirm: '',
        back: '',
    })
    const { matches } = useKeybindings()

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (showSettings) {
                if (matches(event.key, 'back')) {
                    event.preventDefault()
                    setShowSettings(false)
                    setSettingsMessage(null)
                }
                return
            }

            const cols = 6
            const rows = 1

            if (matches(event.key, 'right')) {
                event.preventDefault()
                setFocusedIndex((prev) => (prev + 1) % (cols * rows))
                return
            }

            if (matches(event.key, 'left')) {
                event.preventDefault()
                setFocusedIndex((prev) => (prev - 1 + cols * rows) % (cols * rows))
                return
            }

            if (matches(event.key, 'confirm')) {
                event.preventDefault()
                handleSelect(focusedIndex)
                return
            }

            if (matches(event.key, 'back')) {
                event.preventDefault()
                // Back from home = close app
                handleClose()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [focusedIndex, onNavigate, matches, showSettings])

    const handleSelect = (index: number) => {
        const tile = HOME_TILES[index]
        console.log('Selected:', tile.id)

        if (!onNavigate) return

        if (tile.id === 'custom-media') {
            onNavigate('media-app')
            return
        }

        const webAppIds = new Set(['youtube', 'disney-plus', 'prime-video', 'sweet-tv', 'jellyfin'])
        if (webAppIds.has(tile.id)) {
            onNavigate(`web:${tile.id}`)
        }
    }

    const handleClose = () => {
        console.log('Closing app')
        window.electron?.close()
    }

    const handleRestart = () => {
        console.log('Restarting app')
        window.electron?.restart()
    }

    const formatKeyForInput = (key: string) => (key === ' ' ? 'Space' : key)

    const parseKeyList = (raw: string): string[] =>
        raw
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
            .map((key) => (key.toLowerCase() === 'space' ? ' ' : key))

    const openSettings = async () => {
        setSettingsMessage(null)
        setShowSettings(true)
        try {
            const config = await window.electron?.configApi?.get()
            if (!config) {
                return
            }
            setMoviesBasePath(config.moviesBasePath || '')
            setShowsBasePath(config.showsBasePath || '')

            const actions: KeybindingAction[] = ['up', 'down', 'left', 'right', 'confirm', 'back']
            const loadedInputs: Record<KeybindingAction, string> = {
                up: '',
                down: '',
                left: '',
                right: '',
                confirm: '',
                back: '',
            }
            for (const action of actions) {
                loadedInputs[action] = (config.keybindings?.[action] || [])
                    .map(formatKeyForInput)
                    .join(', ')
            }
            setKeybindingInputs(loadedInputs)
        } catch {
            setSettingsMessage('Failed to load settings.')
        }
    }

    const saveSettings = async () => {
        setIsSavingSettings(true)
        setSettingsMessage(null)
        try {
            const keybindings: AppConfig['keybindings'] = {
                up: parseKeyList(keybindingInputs.up),
                down: parseKeyList(keybindingInputs.down),
                left: parseKeyList(keybindingInputs.left),
                right: parseKeyList(keybindingInputs.right),
                confirm: parseKeyList(keybindingInputs.confirm),
                back: parseKeyList(keybindingInputs.back),
            }

            await window.electron?.configApi?.set({
                moviesBasePath: moviesBasePath.trim(),
                showsBasePath: showsBasePath.trim(),
                keybindings,
            })
            setSettingsMessage('Settings saved.')
        } catch {
            setSettingsMessage('Failed to save settings.')
        } finally {
            setIsSavingSettings(false)
        }
    }

    return (
        <div className="home-screen">
            <div className="home-header">
                <h1>Home Media Center</h1>
                <div className="home-actions">
                    <button className="settings-button" onClick={openSettings} title="Settings">⚙</button>
                    <button className="restart-button" onClick={handleRestart} title="Restart">↻</button>
                    <button className="close-button" onClick={handleClose} title="Close">✕</button>
                </div>
            </div>

            {showSettings && (
                <div className="settings-overlay" onClick={() => setShowSettings(false)}>
                    <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
                        <h2>Settings</h2>

                        <div className="settings-field">
                            <label htmlFor="movies-base-path">Movies Base Path</label>
                            <input
                                id="movies-base-path"
                                value={moviesBasePath}
                                onChange={(e) => setMoviesBasePath(e.target.value)}
                                placeholder="/mnt/media/Movies"
                            />
                        </div>

                        <div className="settings-field">
                            <label htmlFor="shows-base-path">Shows Base Path</label>
                            <input
                                id="shows-base-path"
                                value={showsBasePath}
                                onChange={(e) => setShowsBasePath(e.target.value)}
                                placeholder="/mnt/media/Shows"
                            />
                        </div>

                        {(['up', 'down', 'left', 'right', 'confirm', 'back'] as KeybindingAction[]).map((action) => (
                            <div className="settings-field" key={action}>
                                <label htmlFor={`keybinding-${action}`}>Keys: {action}</label>
                                <input
                                    id={`keybinding-${action}`}
                                    value={keybindingInputs[action]}
                                    onChange={(e) =>
                                        setKeybindingInputs((prev) => ({ ...prev, [action]: e.target.value }))
                                    }
                                    placeholder="Comma separated keys"
                                />
                            </div>
                        ))}

                        <p className="settings-hint">Use comma-separated key values, for example: Enter, Space, BrowserBack</p>
                        {settingsMessage && <p className="settings-message">{settingsMessage}</p>}

                        <div className="settings-actions">
                            <button className="settings-cancel" onClick={() => setShowSettings(false)}>Close</button>
                            <button className="settings-save" onClick={saveSettings} disabled={isSavingSettings}>
                                {isSavingSettings ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="tiles-grid">
                {HOME_TILES.map((tile, index) => (
                    <Tile
                        key={tile.id}
                        title={tile.title}
                        icon={tile.icon}
                        description={tile.description}
                        isFocused={index === focusedIndex}
                        onClick={() => handleSelect(index)}
                    />
                ))}
            </div>

            <div className="home-footer">
                <p>Use arrow keys to navigate • Press OK to select</p>
            </div>
        </div>
    )
}

export default HomeScreen
