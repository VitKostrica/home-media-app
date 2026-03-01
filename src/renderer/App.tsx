import React, { useState } from 'react'
import './App.css'
import HomeScreen from './screens/HomeScreen'
import MediaAppScreen from './screens/MediaAppScreen'
import WebAppScreen from './screens/WebAppScreen'

type Screen = 'home' | 'media-app' | 'web-app'
type WebAppId = 'youtube' | 'disney-plus' | 'prime-video' | 'sweet-tv' | 'jellyfin'

const App: React.FC = () => {
    const [currentScreen, setCurrentScreen] = useState<Screen>('home')
    const [currentWebApp, setCurrentWebApp] = useState<WebAppId>('youtube')

    const handleNavigate = (screen: string) => {
        if (screen.startsWith('web:')) {
            const appId = screen.replace('web:', '') as WebAppId
            setCurrentWebApp(appId)
            setCurrentScreen('web-app')
            return
        }
        setCurrentScreen(screen as Screen)
    }

    switch (currentScreen) {
        case 'home':
            return <HomeScreen onNavigate={handleNavigate} />
        case 'media-app':
            return <MediaAppScreen onNavigate={handleNavigate} />
        case 'web-app':
            return <WebAppScreen appId={currentWebApp} onNavigate={handleNavigate} />
        default:
            return <HomeScreen onNavigate={handleNavigate} />
    }
}

export default App
