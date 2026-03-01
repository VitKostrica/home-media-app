import React, { useEffect, useState } from 'react'
import '../styles/WebAppScreen.css'

type WebAppId = 'youtube' | 'disney-plus' | 'prime-video' | 'sweet-tv' | 'jellyfin'

interface WebAppScreenProps {
    appId: WebAppId
    onNavigate: (screen: string) => void
}

const WEB_APPS: Record<WebAppId, { title: string; url: string }> = {
    youtube: { title: 'YouTube', url: 'https://www.youtube.com/tv' },
    'disney-plus': { title: 'Disney+', url: 'https://www.disneyplus.com' },
    'prime-video': { title: 'Prime Video', url: 'https://www.primevideo.com' },
    'sweet-tv': { title: 'Sweet.tv', url: 'https://sweet.tv' },
    jellyfin: { title: 'Jellyfin', url: '' },
}

const WebAppScreen: React.FC<WebAppScreenProps> = ({ appId, onNavigate }) => {
    const [url, setUrl] = useState(WEB_APPS[appId].url)

    useEffect(() => {
        const resolveUrl = async () => {
            if (appId === 'jellyfin') {
                try {
                    const config = await window.electron?.configApi?.get()
                    setUrl(config?.jellyfinUrl || 'http://192.168.0.156:8096')
                } catch {
                    setUrl('http://192.168.0.156:8096')
                }
                return
            }
            setUrl(WEB_APPS[appId].url)
        }
        resolveUrl()
    }, [appId])

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Backspace') {
                event.preventDefault()
                onNavigate('home')
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [onNavigate])

    return (
        <div className="web-app-screen">
            <div className="web-app-header">
                <button className="web-home-button" onClick={() => onNavigate('home')}>
                    ← Home
                </button>
                <h1 className="web-app-title">{WEB_APPS[appId].title}</h1>
                <div className="web-header-spacer" />
            </div>

            <div className="web-app-content">
                <webview
                    key={`${appId}-${url}`}
                    className="web-app-frame"
                    src={url}
                    allowpopups="true"
                    partition="persist:home-media-webapps"
                />
            </div>
        </div>
    )
}

export default WebAppScreen
