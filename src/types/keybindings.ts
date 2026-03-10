export type KeybindingAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back'

export type KeybindingsConfig = Record<KeybindingAction, string[]>

export const DEFAULT_KEYBINDINGS: KeybindingsConfig = {
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

export function normalizeKeybindings(
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

export function isKeyForAction(
    key: string,
    action: KeybindingAction,
    keybindings: KeybindingsConfig
): boolean {
    const normalizedPressed = normalizeKeyName(key)
    return keybindings[action].some((bound) => normalizeKeyName(bound) === normalizedPressed)
}
