import React, { useState, useEffect, useRef } from 'react'

// ── Shared concurrency limiter ──────────────────────────────
// Limits how many images load from Jellyfin at the same time
// to avoid overwhelming the server with image processing requests.

const MAX_CONCURRENT = 3
let activeLoads = 0
const queue: Array<() => void> = []

function requestSlot(): Promise<void> {
    return new Promise((resolve) => {
        if (activeLoads < MAX_CONCURRENT) {
            activeLoads++
            resolve()
        } else {
            queue.push(() => {
                activeLoads++
                resolve()
            })
        }
    })
}

function releaseSlot(): void {
    activeLoads--
    if (queue.length > 0) {
        const next = queue.shift()!
        next()
    }
}

// ── LazyImage Component ─────────────────────────────────────

interface LazyImageProps {
    src: string
    alt: string
    onError?: () => void
    className?: string
}

const LazyImage: React.FC<LazyImageProps> = ({ src, alt, onError, className }) => {
    const [loadSrc, setLoadSrc] = useState<string | null>(null)
    const [loaded, setLoaded] = useState(false)
    const [failed, setFailed] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const hasRequestedRef = useRef(false)
    const slotAcquiredRef = useRef(false)
    const isMountedRef = useRef(true)

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            isMountedRef.current = false
            // Release slot if acquired but not used
            if (slotAcquiredRef.current) {
                releaseSlot()
                slotAcquiredRef.current = false
            }
        }
    }, [])

    // Reset state when src changes
    useEffect(() => {
        hasRequestedRef.current = false
        setLoadSrc(null)
        setLoaded(false)
        setFailed(false)
    }, [src])

    // IntersectionObserver: only start loading when visible
    useEffect(() => {
        const el = containerRef.current
        if (!el || hasRequestedRef.current) return

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && !hasRequestedRef.current && isMountedRef.current) {
                    hasRequestedRef.current = true
                    observer.disconnect()

                    // Wait for a concurrency slot, then set the src
                    requestSlot().then(() => {
                        slotAcquiredRef.current = true
                        if (isMountedRef.current) {
                            setLoadSrc(src)
                        } else {
                            releaseSlot()
                            slotAcquiredRef.current = false
                        }
                    })
                }
            },
            { rootMargin: '200px' } // start loading slightly before visible
        )

        observer.observe(el)
        return () => observer.disconnect()
    }, [src])

    const handleLoad = () => {
        setLoaded(true)
        releaseSlot()
        slotAcquiredRef.current = false
    }

    const handleError = () => {
        setFailed(true)
        releaseSlot()
        slotAcquiredRef.current = false
        onError?.()
    }

    if (failed) {
        return null // parent will show placeholder
    }

    return (
        <div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }}>
            {loadSrc && (
                <img
                    src={loadSrc}
                    alt={alt}
                    onLoad={handleLoad}
                    onError={handleError}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        opacity: loaded ? 1 : 0,
                        transition: 'opacity 300ms ease',
                    }}
                />
            )}
        </div>
    )
}

export default LazyImage
