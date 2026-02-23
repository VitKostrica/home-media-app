import React, { useState } from 'react'
import './App.css'
import HomeScreen from './screens/HomeScreen'
import ContinueWatchingScreen from './screens/ContinueWatchingScreen'
import MediaAppScreen from './screens/MediaAppScreen'

type Screen = 'home' | 'continue-watching' | 'media-app'

const App: React.FC = () => {
    const [currentScreen, setCurrentScreen] = useState<Screen>('continue-watching')

    const handleNavigate = (screen: string) => {
        setCurrentScreen(screen as Screen)
    }

    switch (currentScreen) {
        case 'home':
            return <HomeScreen onNavigate={handleNavigate} />
        case 'continue-watching':
            return <ContinueWatchingScreen onNavigate={handleNavigate} />
        case 'media-app':
            return <MediaAppScreen onNavigate={handleNavigate} />
        default:
            return <ContinueWatchingScreen onNavigate={handleNavigate} />
    }
}

export default App
