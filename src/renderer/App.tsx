import React, { useState } from 'react'
import './App.css'
import HomeScreen from './screens/HomeScreen'
import MediaAppScreen from './screens/MediaAppScreen'

type Screen = 'home' | 'media-app'

const App: React.FC = () => {
    const [currentScreen, setCurrentScreen] = useState<Screen>('home')

    return currentScreen === 'home' ? (
        <HomeScreen onNavigate={(screen) => setCurrentScreen(screen as Screen)} />
    ) : (
        <MediaAppScreen onBack={() => setCurrentScreen('home')} />
    )
}

export default App
