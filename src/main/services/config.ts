import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

type KeybindingAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back'
type KeybindingsConfig = Record<KeybindingAction, string[]>

const DEFAULT_KEYBINDINGS: KeybindingsConfig = {
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    confirm: ['Enter', ' '],
    back: ['Backspace', 'Escape'],
}

function normalizeKeyName(key: string): string {
    const trimmed = key.trim()
    if (!trimmed || key === ' ') {
        return ' '
    }

    const lower = trimmed.toLowerCase()
    if (lower === 'space' || lower === 'spacebar') {
        return ' '
    }
    if (lower === 'esc') {
        return 'escape'
    }
    if (lower === 'return') {
        return 'enter'
    }

    return lower
}

function dedupeKeys(keys: string[]): string[] {
    const seen = new Set<string>()
    const result: string[] = []

    for (const key of keys) {
        const normalized = normalizeKeyName(key)
        if (!normalized || seen.has(normalized)) {
            continue
        }
        seen.add(normalized)
        result.push(key)
    }

    return result
}

function normalizeKeybindings(
    raw: Partial<Record<KeybindingAction, unknown>> | undefined = undefined
): KeybindingsConfig {
    const normalized: KeybindingsConfig = {
        up: [...DEFAULT_KEYBINDINGS.up],
        down: [...DEFAULT_KEYBINDINGS.down],
        left: [...DEFAULT_KEYBINDINGS.left],
        right: [...DEFAULT_KEYBINDINGS.right],
        confirm: [...DEFAULT_KEYBINDINGS.confirm],
        back: [...DEFAULT_KEYBINDINGS.back],
    }

    const actions: KeybindingAction[] = ['up', 'down', 'left', 'right', 'confirm', 'back']
    for (const action of actions) {
        const value = raw?.[action]
        if (Array.isArray(value)) {
            const extras = value.filter((entry): entry is string => typeof entry === 'string')
            normalized[action] = dedupeKeys([...normalized[action], ...extras])
        }
    }

    return normalized
}

// Config types (defined locally for main process compilation)
interface AppConfig {
    jellyfinUrl: string
    jellyfinApiKey: string
    jellyfinUserId: string
    jellyfinUsername: string
    mediaBasePath: string
    moviesBasePath: string
    showsBasePath: string
    defaultPlayer: 'mpv' | 'vlc'
    keybindings: KeybindingsConfig
}

const DEFAULT_CONFIG: AppConfig = {
    jellyfinUrl: 'http://192.168.0.156:8096',
    jellyfinApiKey: '',
    jellyfinUserId: '',
    jellyfinUsername: '',
    mediaBasePath: '',
    moviesBasePath: '',
    showsBasePath: '',
    defaultPlayer: 'mpv',
    keybindings: normalizeKeybindings(),
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
            const parsed = JSON.parse(data) as Partial<AppConfig>
            return {
                ...DEFAULT_CONFIG,
                ...parsed,
                keybindings: normalizeKeybindings(parsed.keybindings),
            }
        }
    } catch (err) {
        console.error('Failed to load config:', err)
    }
    return {
        ...DEFAULT_CONFIG,
        keybindings: normalizeKeybindings(),
    }
}

export function getConfig(): AppConfig {
    if (!config) {
        config = load()
    }
    return { ...config }
}

export function setConfig(partial: Partial<AppConfig>): void {
    const currentConfig = getConfig()
    config = {
        ...currentConfig,
        ...partial,
        keybindings: normalizeKeybindings({
            ...currentConfig.keybindings,
            ...(partial.keybindings || {}),
        }),
    }
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
