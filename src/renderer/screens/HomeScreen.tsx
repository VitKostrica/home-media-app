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
]

const HomeScreen: React.FC = () => {
    const [focusedIndex, setFocusedIndex] = useState(0)

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const cols = 5
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
                    // TODO: Back button handler (exit app)
                    break
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [focusedIndex])

    const handleSelect = (index: number) => {
        const tile = HOME_TILES[index]
        console.log('Selected:', tile.id)
        // TODO: Launch the selected app
    }

    return (
        <div className="home-screen">
            <div className="home-header">
                <h1>Home Media Center</h1>
            </div>

            <div className="tiles-grid">
                {HOME_TILES.map((tile, index) => (
                    <Tile
                        key={tile.id}
                        title={tile.title}
                        icon={tile.icon}
                        description={tile.description}
                        isFocused={index === focusedIndex}
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
