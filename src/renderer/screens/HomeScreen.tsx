import React, { useState, useEffect } from 'react'
import '../styles/HomeScreen.css'
import Tile from '../components/Tile'

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
        icon: '🎬',
        description: 'Local movies & shows',
    },
    {
        id: 'youtube',
        title: 'YouTube',
        icon: '▶️',
        description: 'Online videos',
    },
    {
        id: 'disney-plus',
        title: 'Disney+',
        icon: '✨',
        description: 'Disney content',
    },
    {
        id: 'prime-video',
        title: 'Prime Video',
        icon: '🎯',
        description: 'Prime content',
    },
    {
        id: 'sweet-tv',
        title: 'Sweet.tv',
        icon: '📺',
        description: 'Sweet.tv service',
    },
    {
        id: 'jellyfin',
        title: 'Jellyfin',
        icon: '🎥',
        description: 'Personal media server',
    },
]

interface HomeScreenProps {
    onNavigate?: (screen: string) => void
}

const HomeScreen: React.FC<HomeScreenProps> = ({ onNavigate }) => {
    const [focusedIndex, setFocusedIndex] = useState(0)

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const cols = 6
            const rows = 1

            switch (event.key) {
                case 'ArrowRight':
                    event.preventDefault()
                    setFocusedIndex((prev) => (prev + 1) % (cols * rows))
                    break
                case 'ArrowLeft':
                    event.preventDefault()
                    setFocusedIndex((prev) => (prev - 1 + cols * rows) % (cols * rows))
                    break
                case 'Enter':
                case ' ':
                    event.preventDefault()
                    handleSelect(focusedIndex)
                    break
                case 'Backspace':
                    event.preventDefault()
                    // Back from home = close app
                    handleClose()
                    break
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [focusedIndex, onNavigate])

    const handleSelect = (index: number) => {
        const tile = HOME_TILES[index]
        console.log('Selected:', tile.id)

        if (tile.id === 'custom-media' && onNavigate) {
            onNavigate('media-app')
        }
        // TODO: Handle other tiles (launch external apps)
    }

    const handleClose = () => {
        console.log('Closing app')
        window.electron?.close()
    }

    return (
        <div className="home-screen">
            <div className="home-header">
                <h1>Home Media Center</h1>
                <button className="close-button" onClick={handleClose} title="Close">✕</button>
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
