import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

// Config types (defined locally for main process compilation)
interface AppConfig {
    jellyfinUrl: string
    jellyfinApiKey: string
    jellyfinUserId: string
    jellyfinUsername: string
    mediaBasePath: string
    defaultPlayer: 'mpv' | 'vlc'
}

const DEFAULT_CONFIG: AppConfig = {
    jellyfinUrl: 'http://192.168.0.156:8096',
    jellyfinApiKey: '',
    jellyfinUserId: '',
    jellyfinUsername: '',
    mediaBasePath: '',
    defaultPlayer: 'mpv',
}

let config: AppConfig | null = null

function getConfigPath(): string {
    return path.join(app.getPath('userData'), 'config.json')
}

function load(): AppConfig {
    try {
        const configPath = getConfigPath()
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf-8')
            return { ...DEFAULT_CONFIG, ...JSON.parse(data) }
        }
    } catch (err) {
        console.error('Failed to load config:', err)
    }
    return { ...DEFAULT_CONFIG }
}

export function getConfig(): AppConfig {
    if (!config) {
        config = load()
    }
    return { ...config }
}

export function setConfig(partial: Partial<AppConfig>): void {
    config = { ...getConfig(), ...partial }
    try {
        const configPath = getConfigPath()
        const dir = path.dirname(configPath)
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
    } catch (err) {
        console.error('Failed to save config:', err)
    }
}
