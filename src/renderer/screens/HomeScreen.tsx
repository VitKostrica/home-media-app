import React, { useState, useEffect } from 'react'
import '../styles/HomeScreen.css'
import Tile from '../components/Tile'
import { useKeybindings } from '../hooks/useKeybindings'

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
    const { matches } = useKeybindings()

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
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
    }, [focusedIndex, onNavigate, matches])

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

    return (
        <div className="home-screen">
            <div className="home-header">
                <h1>Home Media Center</h1>
                <div className="home-actions">
                    <button className="restart-button" onClick={handleRestart} title="Restart">↻</button>
                    <button className="close-button" onClick={handleClose} title="Close">✕</button>
                </div>
            </div>

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
