import React, { useEffect, useRef, useState } from 'react'
import '../styles/WebAppScreen.css'
import { useKeybindings } from '../hooks/useKeybindings'

type WebAppId = 'youtube' | 'disney-plus' | 'prime-video' | 'sweet-tv' | 'jellyfin'

interface WebAppScreenProps {
    appId: WebAppId
    onNavigate: (screen: string) => void
}

const DESKTOP_CHROME_UA =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const WEB_APPS: Record<WebAppId, { title: string; url: string; userAgent?: string }> = {
    youtube: { title: 'YouTube', url: 'https://www.youtube.com', userAgent: DESKTOP_CHROME_UA },
    'disney-plus': { title: 'Disney+', url: 'https://www.disneyplus.com' },
    'prime-video': { title: 'Prime Video', url: 'https://www.primevideo.com' },
    'sweet-tv': { title: 'Sweet.tv', url: 'https://sweet.tv' },
    jellyfin: { title: 'Jellyfin', url: '' },
}

const WebAppScreen: React.FC<WebAppScreenProps> = ({ appId, onNavigate }) => {
    const [url, setUrl] = useState(WEB_APPS[appId].url)
    const webviewRef = useRef<HTMLElement | null>(null)
    const { matches } = useKeybindings()

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
            if (matches(event.key, 'back')) {
                event.preventDefault()
                onNavigate('home')
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [onNavigate, matches])

    useEffect(() => {
        const webview = webviewRef.current as any
        if (!webview) return

        const onFailLoad = (event: any) => {
            console.error('[WebApp] webview failed to load', {
                appId,
                code: event?.errorCode,
                description: event?.errorDescription,
                url: event?.validatedURL || url,
            })
        }

        webview.addEventListener('did-fail-load', onFailLoad)
        return () => webview.removeEventListener('did-fail-load', onFailLoad)
    }, [appId, url])

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
                    ref={(el) => {
                        webviewRef.current = el
                    }}
                    className="web-app-frame"
                    src={url}
                    allowpopups={true}
                    partition="persist:home-media-webapps"
                    useragent={WEB_APPS[appId].userAgent}
                />
            </div>
        </div>
    )
}

export default WebAppScreen
