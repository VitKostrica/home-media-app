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
        headers['X-Emby-Token'] = accessToken
    }
    return headers
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

    return {
        id: item.Id,
        title: item.Name,
        type: item.Type === 'Movie' ? 'movie' : item.Type === 'Series' ? 'series' : 'episode',
        year: item.ProductionYear,
        posterUrl: item.ImageTags?.Primary
            ? `${config.jellyfinUrl}/Items/${item.Id}/Images/Primary?tag=${item.ImageTags.Primary}${token ? `&api_key=${token}` : ''}`
            : undefined,
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
        filePath: item.Path || (item.MediaSources && item.MediaSources[0]?.Path),
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
                Fields: 'Overview,Path,MediaSources,UserData',
                SortBy: 'DatePlayed',
                SortOrder: 'Descending',
            },
            headers: getHeaders(),
        })
        return (response.data.Items || []).map(mapItem)
    } catch (err) {
        console.error('Failed to fetch resume items:', err)
        return []
    }
}

/** Get playback info for an item (gets the stream URL) */
export async function getPlaybackInfo(
    itemId: string
): Promise<{ streamUrl?: string; mediaSourceId?: string }> {
    if (!ensureAuth()) return {}

    try {
        const config = getConfig()
        const token = accessToken || config.jellyfinApiKey

        // Use streaming endpoint with progressive parameters
        // static=false enables streaming/transcoding instead of full file download
        // This ensures Jellyfin only sends data as it's needed for playback
        const params = new URLSearchParams({
            api_key: token,
            static: 'false', // Force streaming instead of direct file download
        })
        const streamUrl = `${config.jellyfinUrl}/Videos/${itemId}/stream?${params.toString()}`
        
        console.log('Using streaming URL:', streamUrl)

        return {
            streamUrl,
            mediaSourceId: 'default',
        }
    } catch (err) {
        console.error('Failed to get stream URL:', err)
        return {}
    }
}

/** Tell Jellyfin playback has started */
export async function reportPlaybackStart(itemId: string, positionTicks: number = 0): Promise<void> {
    if (!ensureAuth()) return

    try {
        const api = getClient()
        await api.post(
            '/Sessions/Playing',
            {
                ItemId: itemId,
                PositionTicks: positionTicks,
                PlayMethod: 'DirectPlay',
            },
            { headers: getHeaders() }
        )
    } catch (err) {
        console.error('Failed to report playback start:', err)
    }
}

/** Update Jellyfin with current playback position */
export async function reportProgress(itemId: string, positionTicks: number): Promise<void> {
    if (!ensureAuth()) return

    try {
        const api = getClient()
        await api.post(
            '/Sessions/Playing/Progress',
            {
                ItemId: itemId,
                PositionTicks: positionTicks,
                IsPaused: false,
            },
            { headers: getHeaders() }
        )
    } catch (err) {
        console.error('Failed to report progress:', err)
    }
}

/** Tell Jellyfin playback has stopped */
export async function reportStopped(itemId: string, positionTicks: number): Promise<void> {
    if (!ensureAuth()) return

    try {
        const api = getClient()
        await api.post(
            '/Sessions/Playing/Stopped',
            {
                ItemId: itemId,
                PositionTicks: positionTicks,
            },
            { headers: getHeaders() }
        )
    } catch (err) {
        console.error('Failed to report playback stopped:', err)
    }
}
