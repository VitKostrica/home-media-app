import React, { useState, useRef, useEffect } from 'react'
import '../styles/JellyfinLogin.css'

interface JellyfinLoginProps {
    onSuccess: () => void
}

const JellyfinLogin: React.FC<JellyfinLoginProps> = ({ onSuccess }) => {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [serverUrl, setServerUrl] = useState('http://192.168.0.156:8096')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [focusedField, setFocusedField] = useState<'server' | 'username' | 'password' | 'submit'>('username')

    const serverRef = useRef<HTMLInputElement>(null)
    const usernameRef = useRef<HTMLInputElement>(null)
    const passwordRef = useRef<HTMLInputElement>(null)
    const submitRef = useRef<HTMLButtonElement>(null)

    // Load saved server URL from config
    useEffect(() => {
        const loadConfig = async () => {
            try {
                const config = await window.electron?.configApi?.get()
                if (config?.jellyfinUrl) {
                    setServerUrl(config.jellyfinUrl)
                }
                if (config?.jellyfinUsername) {
                    setUsername(config.jellyfinUsername)
                }
            } catch {
                // Use defaults
            }
        }
        loadConfig()
    }, [])

    // Focus the username input on mount
    useEffect(() => {
        usernameRef.current?.focus()
    }, [])

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault()

        if (!username.trim()) {
            setError('Username is required')
            usernameRef.current?.focus()
            return
        }

        setLoading(true)
        setError(null)

        try {
            // Save server URL to config first
            await window.electron?.configApi?.set({ jellyfinUrl: serverUrl })

            // Authenticate
            const result = await window.electron?.jellyfinApi?.authenticate(username, password)

            if (result?.success) {
                onSuccess()
            } else {
                setError(result?.error || 'Authentication failed')
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Connection failed'
            setError(message)
        } finally {
            setLoading(false)
        }
    }

    // Keyboard navigation between fields (arrow keys)
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (focusedField === 'server') {
                setFocusedField('username')
                usernameRef.current?.focus()
            } else if (focusedField === 'username') {
                setFocusedField('password')
                passwordRef.current?.focus()
            } else if (focusedField === 'password') {
                setFocusedField('submit')
                submitRef.current?.focus()
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            if (focusedField === 'submit') {
                setFocusedField('password')
                passwordRef.current?.focus()
            } else if (focusedField === 'password') {
                setFocusedField('username')
                usernameRef.current?.focus()
            } else if (focusedField === 'username') {
                setFocusedField('server')
                serverRef.current?.focus()
            }
        }
    }

    return (
        <div className="jellyfin-login" onKeyDown={handleKeyDown}>
            <form className="login-card" onSubmit={handleSubmit}>
                <div className="login-header">
                    <div className="login-icon">🎬</div>
                    <h2 className="login-title">Connect to Jellyfin</h2>
                    <p className="login-subtitle">Sign in to browse your media library</p>
                </div>

                {error && (
                    <div className="login-error">
                        <span className="login-error-icon">!</span>
                        {error}
                    </div>
                )}

                <div className="login-fields">
                    <div className={`login-field ${focusedField === 'server' ? 'field-focused' : ''}`}>
                        <label className="login-label" htmlFor="server">Server URL</label>
                        <input
                            ref={serverRef}
                            id="server"
                            type="text"
                            className="login-input"
                            value={serverUrl}
                            onChange={(e) => setServerUrl(e.target.value)}
                            onFocus={() => setFocusedField('server')}
                            placeholder="http://192.168.0.156:8096"
                            disabled={loading}
                            autoComplete="off"
                        />
                    </div>

                    <div className={`login-field ${focusedField === 'username' ? 'field-focused' : ''}`}>
                        <label className="login-label" htmlFor="username">Username</label>
                        <input
                            ref={usernameRef}
                            id="username"
                            type="text"
                            className="login-input"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            onFocus={() => setFocusedField('username')}
                            placeholder="Enter your username"
                            disabled={loading}
                            autoComplete="off"
                        />
                    </div>

                    <div className={`login-field ${focusedField === 'password' ? 'field-focused' : ''}`}>
                        <label className="login-label" htmlFor="password">Password</label>
                        <input
                            ref={passwordRef}
                            id="password"
                            type="password"
                            className="login-input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onFocus={() => setFocusedField('password')}
                            placeholder="Enter your password"
                            disabled={loading}
                            autoComplete="off"
                        />
                    </div>
                </div>

                <button
                    ref={submitRef}
                    type="submit"
                    className={`login-submit ${focusedField === 'submit' ? 'focused' : ''}`}
                    disabled={loading}
                    onFocus={() => setFocusedField('submit')}
                >
                    {loading ? (
                        <>
                            <div className="login-spinner" />
                            Connecting...
                        </>
                    ) : (
                        'Sign In'
                    )}
                </button>

                <p className="login-hint">
                    ↑↓ Navigate fields • Enter to submit
                </p>
            </form>
        </div>
    )
}

export default JellyfinLogin
