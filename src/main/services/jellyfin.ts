import axios, { AxiosInstance } from 'axios'
import { getConfig, setConfig } from './config'

// Jellyfin API response types
interface JellyfinItem {
    Id: string
    Name: string
    Type: string
    ProductionYear?: number
    Overview?: string
    RunTimeTicks?: number
    ImageTags?: { Primary?: string }
    BackdropImageTags?: string[]
    UserData?: {
        PlaybackPositionTicks?: number
        Played?: boolean
        PlayedPercentage?: number
    }
    Path?: string
    SeriesId?: string
    SeriesPrimaryImageTag?: string
    ParentThumbItemId?: string
    ParentThumbImageTag?: string
    SeriesName?: string
    SeasonName?: string
    IndexNumber?: number
    ParentIndexNumber?: number
    MediaSources?: Array<{
        Id?: string
        Path?: string
    }>
}

interface MappedItem {
    id: string
    title: string
    type: 'movie' | 'series' | 'episode'
    year?: number
    posterUrl?: string
    backdropUrl?: string
    overview?: string
    duration?: number
    watched: boolean
    resumePosition?: number
    playedPercentage?: number
    filePath?: string
    seriesName?: string
    seasonName?: string
    seasonNumber?: number
    episodeNumber?: number
}

interface PlaybackInfoResponse {
    MediaSources?: Array<{
        DirectStreamUrl?: string
        TranscodingUrl?: string
        Path?: string
        Protocol?: string
    }>
}

// Jellyfin auth header
const CLIENT_INFO = 'MediaBrowser Client="Home Media App", Device="Linux PC", DeviceId="home-media-app-electron", Version="0.1.0"'

let client: AxiosInstance | null = null
let currentServerUrl: string = ''
let accessToken: string = ''
let userId: string = ''

function getClient(): AxiosInstance {
    const config = getConfig()
    if (!client || currentServerUrl !== config.jellyfinUrl) {
        currentServerUrl = config.jellyfinUrl
        client = axios.create({
            baseURL: currentServerUrl,
            timeout: 10000,
        })
    }
    return client
}

function getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
        'X-Emby-Authorization': CLIENT_INFO,
    }
    if (accessToken) {
        headers['X-Emby-Authorization'] = `${CLIENT_INFO}, Token="${accessToken}"`
        headers['X-Emby-Token'] = accessToken
        headers['X-MediaBrowser-Token'] = accessToken
    }
    return headers
}

function clearAuth(): void {
    accessToken = ''
    userId = ''
    setConfig({
        jellyfinApiKey: '',
        jellyfinUserId: '',
    })
}

function handleAuthError(err: any): void {
    if (err?.response?.status === 401) {
        console.warn('Jellyfin returned 401, clearing saved auth.')
        clearAuth()
    }
}

/** Restore credentials from saved config */
function ensureAuth(): boolean {
    if (accessToken && userId) return true
    const config = getConfig()
    if (config.jellyfinApiKey && config.jellyfinUserId) {
        accessToken = config.jellyfinApiKey
        userId = config.jellyfinUserId
        return true
    }
    return false
}

/** Map a Jellyfin API item to our clean format */
function mapItem(item: JellyfinItem): MappedItem {
    const config = getConfig()
    const token = accessToken || config.jellyfinApiKey
    const filePath = item.Path || (item.MediaSources && item.MediaSources[0]?.Path)
    const itemType = item.Type === 'Movie' ? 'movie' : item.Type === 'Series' ? 'series' : 'episode'

    // Always use Jellyfin for poster images
    let posterUrl = item.ImageTags?.Primary
        ? `${config.jellyfinUrl}/Items/${item.Id}/Images/Primary?tag=${item.ImageTags.Primary}${token ? `&api_key=${token}` : ''}`
        : undefined

    // For episodes, prefer series poster so cards match Movies/Shows visual style.
    if (itemType === 'episode') {
        if (item.SeriesId && item.SeriesPrimaryImageTag) {
            posterUrl = `${config.jellyfinUrl}/Items/${item.SeriesId}/Images/Primary?tag=${item.SeriesPrimaryImageTag}${token ? `&api_key=${token}` : ''}`
        } else if (item.ParentThumbItemId && item.ParentThumbImageTag) {
            posterUrl = `${config.jellyfinUrl}/Items/${item.ParentThumbItemId}/Images/Primary?tag=${item.ParentThumbImageTag}${token ? `&api_key=${token}` : ''}`
        }
    }

    return {
        id: item.Id,
        title: item.Name,
        type: itemType,
        year: item.ProductionYear,
        posterUrl,
        backdropUrl: item.BackdropImageTags?.length
            ? `${config.jellyfinUrl}/Items/${item.Id}/Images/Backdrop?tag=${item.BackdropImageTags[0]}${token ? `&api_key=${token}` : ''}`
            : undefined,
        overview: item.Overview,
        duration: item.RunTimeTicks ? Math.floor(item.RunTimeTicks / 10000000) : undefined,
        watched: item.UserData?.Played || false,
        resumePosition: item.UserData?.PlaybackPositionTicks
            ? Math.floor(item.UserData.PlaybackPositionTicks / 10000000)
            : 0,
        playedPercentage: item.UserData?.PlayedPercentage || 0,
        filePath,
        seriesName: item.SeriesName,
        seasonName: item.SeasonName,
        seasonNumber: item.ParentIndexNumber,
        episodeNumber: item.IndexNumber,
    }
}

/** Convert item ID to GUID format with hyphens */
function idToGuid(id: string): string {
    if (id.includes('-')) return id // already GUID format
    if (id.length !== 32) return id // not a valid hex ID
    return `${id.substring(0, 8)}-${id.substring(8, 12)}-${id.substring(12, 16)}-${id.substring(16, 20)}-${id.substring(20, 32)}`
}

// ── Public API ───────────────────────────────────────────────

export async function authenticate(
    username: string,
    password: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const api = getClient()
        const response = await api.post(
            '/Users/AuthenticateByName',
            { Username: username, Pw: password },
            { headers: getHeaders() }
        )

        accessToken = response.data.AccessToken
        userId = response.data.User.Id

        // Persist credentials
        setConfig({
            jellyfinApiKey: accessToken,
            jellyfinUserId: userId,
            jellyfinUsername: username,
        })

        return { success: true }
    } catch (err: any) {
        const msg = err.response?.data?.Message || err.message || 'Authentication failed'
        console.error('Jellyfin auth failed:', msg)
        return { success: false, error: msg }
    }
}

export async function getMovies(): Promise<MappedItem[]> {
    if (!ensureAuth()) return []

    try {
        const api = getClient()
        const response = await api.get(`/Users/${userId}/Items`, {
            params: {
                IncludeItemTypes: 'Movie',
                Recursive: true,
                Fields: 'Overview,Path,MediaSources,UserData',
                SortBy: 'SortName',
                SortOrder: 'Ascending',
            },
            headers: getHeaders(),
        })
        return (response.data.Items || []).map(mapItem)
    } catch (err) {
        handleAuthError(err)
        console.error('Failed to fetch movies:', err)
        return []
    }
}

export async function getSeries(): Promise<MappedItem[]> {
    if (!ensureAuth()) return []

    try {
        const api = getClient()
        const response = await api.get(`/Users/${userId}/Items`, {
            params: {
                IncludeItemTypes: 'Series',
                Recursive: true,
                Fields: 'Overview,Path,UserData',
                SortBy: 'SortName',
                SortOrder: 'Ascending',
            },
            headers: getHeaders(),
        })
        return (response.data.Items || []).map(mapItem)
    } catch (err) {
        handleAuthError(err)
        console.error('Failed to fetch series:', err)
        return []
    }
}

export async function getSeasons(seriesId: string): Promise<MappedItem[]> {
    if (!ensureAuth()) return []

    try {
        const api = getClient()
        const response = await api.get(`/Shows/${seriesId}/Seasons`, {
            params: {
                UserId: userId,
                Fields: 'Overview,UserData',
            },
            headers: getHeaders(),
        })
        return (response.data.Items || []).map(mapItem)
    } catch (err) {
        handleAuthError(err)
        console.error('Failed to fetch seasons:', err)
        return []
    }
}

export async function getEpisodes(
    seriesId: string,
    seasonId: string
): Promise<MappedItem[]> {
    if (!ensureAuth()) return []

    try {
        const api = getClient()
        const response = await api.get(`/Shows/${seriesId}/Episodes`, {
            params: {
                UserId: userId,
                SeasonId: seasonId,
                Fields: 'Overview,Path,MediaSources,UserData',
            },
            headers: getHeaders(),
        })
        return (response.data.Items || []).map(mapItem)
    } catch (err) {
        handleAuthError(err)
        console.error('Failed to fetch episodes:', err)
        return []
    }
}

/** Get items with resume position (Continue Watching) */
export async function getResumeItems(): Promise<MappedItem[]> {
    if (!ensureAuth()) return []

    try {
        const api = getClient()
        const response = await api.get(`/Users/${userId}/Items/Resume`, {
            params: {
                Limit: 50,
                Recursive: true,
                Fields: 'Overview,Path,MediaSources,UserData,SeriesPrimaryImageTag,ParentThumbItemId,ParentThumbImageTag',
                SortBy: 'DatePlayed',
                SortOrder: 'Descending',
            },
            headers: getHeaders(),
        })
        return (response.data.Items || []).map(mapItem)
    } catch (err) {
        handleAuthError(err)
        console.error('Failed to fetch resume items:', err)
        return []
    }
}

/** Get Next Up episodes for Continue Watching */
export async function getNextUpItems(): Promise<MappedItem[]> {
    if (!ensureAuth()) return []

    try {
        const api = getClient()
        const response = await api.get('/Shows/NextUp', {
            params: {
                Limit: 24,
                Fields: 'PrimaryImageAspectRatio,DateCreated,Path,MediaSourceCount,UserData,SeriesPrimaryImageTag,ParentThumbItemId,ParentThumbImageTag',
                UserId: userId,
                ImageTypeLimit: 1,
                EnableImageTypes: 'Primary,Backdrop,Banner,Thumb',
                EnableTotalRecordCount: false,
                DisableFirstEpisode: false,
                NextUpDateCutoff: new Date().toISOString(),
                EnableResumable: false,
                EnableRewatching: false,
            },
            headers: getHeaders(),
        })
        const primaryItems = (response.data.Items || []).map(mapItem)
        if (primaryItems.length > 0) {
            console.log(`[Jellyfin] NextUp primary query returned ${primaryItems.length} items`)
            return primaryItems
        }

        // Fallback for servers that are strict about NextUp filter params.
        const fallbackResponse = await api.get('/Shows/NextUp', {
            params: {
                Limit: 24,
                UserId: userId,
                Fields: 'Overview,Path,MediaSources,UserData,SeriesPrimaryImageTag,ParentThumbItemId,ParentThumbImageTag',
                DisableFirstEpisode: false,
            },
            headers: getHeaders(),
        })

        const fallbackItems = (fallbackResponse.data.Items || []).map(mapItem)
        console.log(`[Jellyfin] NextUp fallback query returned ${fallbackItems.length} items`)
        return fallbackItems
    } catch (err) {
        handleAuthError(err)
        console.error('Failed to fetch next up items:', err)
        return []
    }
}

/** Get playback info for an item (gets the stream URL) */
export async function getPlaybackInfo(
    itemId: string
): Promise<{ streamUrl?: string; mediaSourceId?: string }> {
    if (!ensureAuth()) {
        console.error('getPlaybackInfo: Not authenticated')
        return {}
    }

    try {
        const config = getConfig()
        const token = accessToken || config.jellyfinApiKey
        const client = getClient()

        console.log('getPlaybackInfo: Requesting playback info for itemId:', itemId)

        // First, try the PlaybackInfo endpoint to get streaming options
        // This tells us what streaming methods are available
        const playbackInfoUrl = `/Items/${itemId}/PlaybackInfo?api_key=${token}&UserId=${userId}`

        try {
            console.log('getPlaybackInfo: Calling PlaybackInfo endpoint:', playbackInfoUrl)
            const response = await client.post<any>(playbackInfoUrl, {
                DeviceProfile: {
                    CodecProfiles: [],
                    SubtitleProfiles: [],
                },
            }, {
                headers: getHeaders(),
            })

            console.log('getPlaybackInfo: Response received:', {
                hasMediaSources: !!response.data?.MediaSources,
                mediaSourceCount: response.data?.MediaSources?.length || 0,
                firstMediaSource: response.data?.MediaSources?.[0],
            })

            // Check if we have media sources
            if (response.data?.MediaSources?.[0]) {
                const mediaSource = response.data.MediaSources[0]
                console.log('getPlaybackInfo: Using media source:', {
                    id: mediaSource.Id,
                    supportsDirectStream: mediaSource.SupportsDirectStream,
                    path: mediaSource.Path,
                })

                // Always use HTTP streaming URL from Jellyfin, never file://
                // Electron blocks file:// URLs from the renderer process for security
                // Jellyfin can serve the file via HTTP streaming
                const streamUrl = `${config.jellyfinUrl}/Videos/${itemId}/stream?api_key=${token}&static=true&mediaSourceId=${mediaSource.Id || 'default'}`
                console.log('getPlaybackInfo: Returning HTTP stream URL:', streamUrl)
                return {
                    streamUrl,
                    mediaSourceId: mediaSource.Id || 'default',
                }
            }

            // No suitable media source found, use basic stream endpoint
            const streamUrl = `${config.jellyfinUrl}/Videos/${itemId}/stream?api_key=${token}&static=true`
            console.log('getPlaybackInfo: No suitable media source, using basic stream URL:', streamUrl)
            return {
                streamUrl,
                mediaSourceId: 'default',
            }
        } catch (err: any) {
            console.error('getPlaybackInfo: PlaybackInfo endpoint failed:', {
                error: err?.message,
                status: err?.response?.status,
                data: err?.response?.data,
            })

            // Fallback: use direct stream endpoint
            // This will work if the server supports direct streaming
            const streamUrl = `${config.jellyfinUrl}/Videos/${itemId}/stream?api_key=${token}&static=true`
            console.log('getPlaybackInfo: Using direct stream fallback:', streamUrl)

            return {
                streamUrl,
                mediaSourceId: 'default',
            }
        }
    } catch (err: any) {
        console.error('getPlaybackInfo: Unexpected error:', err?.message || err)
        return {}
    }
}

/** Tell Jellyfin playback has started */
export async function reportPlaybackStart(itemId: string, positionTicks: number = 0): Promise<void> {
    if (!ensureAuth()) return

    try {
        const api = getClient()
        console.log(
            `[JellyfinPlayback] -> Playing item=${itemId} sec=${Math.floor(positionTicks / 10000000)} ticks=${positionTicks}`
        )
        await api.post(
            '/Sessions/Playing',
            {
                ItemId: itemId,
                PositionTicks: positionTicks,
                PlayMethod: 'DirectPlay',
            },
            { headers: getHeaders() }
        )
        console.log('[JellyfinPlayback] <- Playing ok')
    } catch (err) {
        handleAuthError(err)
        const e: any = err
        console.error(
            `[JellyfinPlayback] Playing failed status=${e?.response?.status || 'unknown'} message=${e?.message || err}`
        )
    }
}

/** Update Jellyfin with current playback position */
export async function reportProgress(itemId: string, positionTicks: number): Promise<void> {
    if (!ensureAuth()) return

    try {
        const api = getClient()
        console.log(
            `[JellyfinPlayback] -> Progress item=${itemId} sec=${Math.floor(positionTicks / 10000000)} ticks=${positionTicks}`
        )
        await api.post(
            '/Sessions/Playing/Progress',
            {
                ItemId: itemId,
                PositionTicks: positionTicks,
                IsPaused: false,
            },
            { headers: getHeaders() }
        )
        console.log('[JellyfinPlayback] <- Progress ok')
    } catch (err) {
        handleAuthError(err)
        const e: any = err
        console.error(
            `[JellyfinPlayback] Progress failed status=${e?.response?.status || 'unknown'} message=${e?.message || err}`
        )
    }
}

/** Tell Jellyfin playback has stopped */
export async function reportStopped(itemId: string, positionTicks: number): Promise<void> {
    if (!ensureAuth()) return

    try {
        const api = getClient()
        console.log(
            `[JellyfinPlayback] -> Stopped item=${itemId} sec=${Math.floor(positionTicks / 10000000)} ticks=${positionTicks}`
        )
        await api.post(
            '/Sessions/Playing/Stopped',
            {
                ItemId: itemId,
                PositionTicks: positionTicks,
            },
            { headers: getHeaders() }
        )
        console.log('[JellyfinPlayback] <- Stopped ok')
    } catch (err) {
        handleAuthError(err)
        const e: any = err
        console.error(
            `[JellyfinPlayback] Stopped failed status=${e?.response?.status || 'unknown'} message=${e?.message || err}`
        )
    }
}
