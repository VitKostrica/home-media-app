import React, { useState, useEffect } from 'react'
import '../styles/HomeScreen.css'
import Tile from '../components/Tile'
import { useKeybindings } from '../hooks/useKeybindings'
import type { AppConfig } from '../../types'
import { DEFAULT_KEYBINDINGS, normalizeKeybindings, type KeybindingAction } from '../../types/keybindings'

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
        icon: 'app-icons/jellyfin.png',
        description: 'Local movies & shows',
    },
    {
        id: 'youtube',
        title: 'YouTube',
        icon: 'app-icons/youtube.png',
        description: 'Online videos',
    },
    {
        id: 'disney-plus',
        title: 'Disney+',
        icon: 'app-icons/disney.png',
        description: 'Disney content',
    },
    {
        id: 'prime-video',
        title: 'Prime Video',
        icon: 'app-icons/primevideo.png',
        description: 'Prime content',
    },
    {
        id: 'sweet-tv',
        title: 'Sweet.tv',
        icon: 'app-icons/sweet.png',
        description: 'Sweet.tv service',
    },
    {
        id: 'jellyfin',
        title: 'Jellyfin',
        icon: 'app-icons/jellyfin.png',
        description: 'Personal media server',
    },
]

interface HomeScreenProps {
    onNavigate?: (screen: string) => void
}

const KEYBINDING_ACTIONS: KeybindingAction[] = ['up', 'down', 'left', 'right', 'confirm', 'back']

function normalizeCaptureKey(key: string): string {
    const trimmed = key.trim()
    if (!trimmed || key === ' ') {
        return ' '
    }

    const lower = trimmed.toLowerCase()
    if (lower === 'space' || lower === 'spacebar') {
        return ' '
    }
    if (lower === 'esc') {
        return 'escape'
    }
    if (lower === 'return') {
        return 'enter'
    }

    return lower
}

function isModifierKey(key: string): boolean {
    return ['Shift', 'Control', 'Alt', 'Meta'].includes(key)
}

function formatKeyForDisplay(key: string): string {
    return key === ' ' ? 'Space' : key
}

function getCustomBindings(bindings: AppConfig['keybindings']): AppConfig['keybindings'] {
    const normalized = normalizeKeybindings(bindings)
    const customBindings = {} as AppConfig['keybindings']

    for (const action of KEYBINDING_ACTIONS) {
        const defaultSet = new Set(DEFAULT_KEYBINDINGS[action].map(normalizeCaptureKey))
        customBindings[action] = normalized[action].filter((key) => !defaultSet.has(normalizeCaptureKey(key)))
    }

    return customBindings
}

const HomeScreen: React.FC<HomeScreenProps> = ({ onNavigate }) => {
    const [focusedIndex, setFocusedIndex] = useState(0)
    const [showSettings, setShowSettings] = useState(false)
    const [isSavingSettings, setIsSavingSettings] = useState(false)
    const [settingsMessage, setSettingsMessage] = useState<string | null>(null)
    const [moviesBasePath, setMoviesBasePath] = useState('')
    const [showsBasePath, setShowsBasePath] = useState('')
    const [keybindingInputs, setKeybindingInputs] = useState<AppConfig['keybindings']>({
        up: [],
        down: [],
        left: [],
        right: [],
        confirm: [],
        back: [],
    })
    const [captureAction, setCaptureAction] = useState<KeybindingAction | null>(null)
    const { matches } = useKeybindings()

    const closeSettings = () => {
        setShowSettings(false)
        setCaptureAction(null)
        setSettingsMessage(null)
    }

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (showSettings) {
                if (matches(event.key, 'back')) {
                    event.preventDefault()
                    closeSettings()
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
                handleClose()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [focusedIndex, matches, showSettings])

    useEffect(() => {
        if (!showSettings || !captureAction) {
            return
        }

        const handleCaptureKeyDown = (event: KeyboardEvent) => {
            if (isModifierKey(event.key)) {
                return
            }

            event.preventDefault()
            event.stopPropagation()

            const capturedKey = normalizeCaptureKey(event.key)
            if (!capturedKey) {
                return
            }

            const normalizedCaptured = normalizeCaptureKey(capturedKey)
            const defaultKeys = DEFAULT_KEYBINDINGS[captureAction].map(normalizeCaptureKey)

            if (defaultKeys.includes(normalizedCaptured)) {
                setSettingsMessage(`${formatKeyForDisplay(capturedKey)} is already a default key for ${captureAction}.`)
                setCaptureAction(null)
                return
            }

            setKeybindingInputs((prev) => {
                const existing = prev[captureAction]
                const normalizedExisting = new Set(existing.map(normalizeCaptureKey))
                if (normalizedExisting.has(normalizedCaptured)) {
                    return prev
                }

                return {
                    ...prev,
                    [captureAction]: [...existing, capturedKey],
                }
            })

            setSettingsMessage(`Added ${formatKeyForDisplay(capturedKey)} to ${captureAction}.`)
            setCaptureAction(null)
        }

        window.addEventListener('keydown', handleCaptureKeyDown, true)
        return () => window.removeEventListener('keydown', handleCaptureKeyDown, true)
    }, [captureAction, showSettings])

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

    const openSettings = async () => {
        setSettingsMessage(null)
        setCaptureAction(null)
        setShowSettings(true)
        try {
            const config = await window.electron?.configApi?.get()
            if (!config) {
                return
            }
            setMoviesBasePath(config.moviesBasePath || '')
            setShowsBasePath(config.showsBasePath || '')
            setKeybindingInputs(getCustomBindings(config.keybindings))
        } catch {
            setSettingsMessage('Failed to load settings.')
        }
    }

    const clearKeybindings = () => {
        setKeybindingInputs({
            up: [],
            down: [],
            left: [],
            right: [],
            confirm: [],
            back: [],
        })
        setCaptureAction(null)
        setSettingsMessage('Custom keybindings cleared.')
    }

    const saveSettings = async () => {
        setIsSavingSettings(true)
        setSettingsMessage(null)
        try {
            await window.electron?.configApi?.set({
                moviesBasePath: moviesBasePath.trim(),
                showsBasePath: showsBasePath.trim(),
                keybindings: keybindingInputs,
            })
            setSettingsMessage('Settings saved.')
        } catch {
            setSettingsMessage('Failed to save settings.')
        } finally {
            setIsSavingSettings(false)
        }
    }

    return (
        <div className="home-screen" style={{ backgroundImage: "url('app-icons/background.jpg')" }}>
            <div className="home-header">
                <h1>Home Media Center</h1>
                <div className="home-actions">
                    <button className="settings-button" onClick={openSettings} title="Settings">
                        ⚙
                    </button>
                    <button className="restart-button" onClick={handleRestart} title="Restart">
                        ↻
                    </button>
                    <button className="close-button" onClick={handleClose} title="Close">
                        ✕
                    </button>
                </div>
            </div>

            {showSettings && (
                <div className="settings-overlay" onClick={closeSettings}>
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

                        {KEYBINDING_ACTIONS.map((action) => (
                            <div className="settings-field keybinding-field" key={action}>
                                <div className="keybinding-header">
                                    <label>Keys: {action}</label>
                                    <div className="keybinding-actions">
                                        <button
                                            className="keybinding-add"
                                            type="button"
                                            onClick={() => {
                                                setCaptureAction(action)
                                                setSettingsMessage(`Press a key for ${action}.`)
                                            }}
                                        >
                                            {captureAction === action ? 'Listening...' : 'Add key'}
                                        </button>
                                        <button
                                            className="keybinding-clear"
                                            type="button"
                                            onClick={() =>
                                                setKeybindingInputs((prev) => ({
                                                    ...prev,
                                                    [action]: [],
                                                }))
                                            }
                                        >
                                            Clear
                                        </button>
                                    </div>
                                </div>

                                <div className="keybinding-chip-list">
                                    {keybindingInputs[action].length === 0 ? (
                                        <span className="keybinding-empty">No custom keys yet</span>
                                    ) : (
                                        keybindingInputs[action].map((key) => (
                                            <button
                                                key={`${action}-${key}`}
                                                type="button"
                                                className="keybinding-chip"
                                                onClick={() =>
                                                    setKeybindingInputs((prev) => ({
                                                        ...prev,
                                                        [action]: prev[action].filter((item) => item !== key),
                                                    }))
                                                }
                                                title="Remove key"
                                            >
                                                <span>{formatKeyForDisplay(key)}</span>
                                                <span className="keybinding-chip-remove">×</span>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        ))}

                        <p className="settings-hint">
                            Default keys stay active. Click Add key, press the button you want to assign, and use
                            Clear to remove only custom additions.
                        </p>
                        {settingsMessage && <p className="settings-message">{settingsMessage}</p>}

                        <div className="settings-actions">
                            <button className="settings-clear" type="button" onClick={clearKeybindings}>
                                Clear inputs
                            </button>
                            <button className="settings-cancel" onClick={closeSettings}>
                                Close
                            </button>
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
