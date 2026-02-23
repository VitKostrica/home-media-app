import React, { useState } from 'react'
import './App.css'
import HomeScreen from './screens/HomeScreen'
import MediaAppScreen from './screens/MediaAppScreen'

type Screen = 'home' | 'media-app'

const App: React.FC = () => {
    const [currentScreen, setCurrentScreen] = useState<Screen>('home')

    const handleNavigate = (screen: string) => {
        setCurrentScreen(screen as Screen)
    }

    switch (currentScreen) {
        case 'home':
            return <HomeScreen onNavigate={handleNavigate} />
        case 'media-app':
            return <MediaAppScreen onNavigate={handleNavigate} />
        default:
            return <HomeScreen onNavigate={handleNavigate} />
    }
}

export default App
