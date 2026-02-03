import React from 'react'
import '../styles/Tile.css'

interface TileProps {
    title: string
    icon: string
    description: string
    isFocused: boolean
}

const Tile: React.FC<TileProps> = ({ title, icon, description, isFocused }) => {
    return (
        <div className={`tile ${isFocused ? 'focused' : ''}`}>
            <div className="tile-icon">{icon}</div>
            <h3 className="tile-title">{title}</h3>
            <p className="tile-description">{description}</p>
        </div>
    )
}

export default Tile

