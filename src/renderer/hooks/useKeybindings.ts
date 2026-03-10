import { useCallback, useEffect, useState } from 'react'
import {
    DEFAULT_KEYBINDINGS,
    isKeyForAction,
    KeybindingAction,
    KeybindingsConfig,
    normalizeKeybindings,
} from '../../types/keybindings'

export function useKeybindings() {
    const [keybindings, setKeybindings] = useState<KeybindingsConfig>(normalizeKeybindings(DEFAULT_KEYBINDINGS))

    useEffect(() => {
        let mounted = true

        const loadConfig = async () => {
            try {
                const config = await window.electron?.configApi?.get()
                if (!mounted) {
                    return
                }
                setKeybindings(normalizeKeybindings(config?.keybindings))
            } catch {
                if (!mounted) {
                    return
                }
                setKeybindings(normalizeKeybindings())
            }
        }

        loadConfig()

        return () => {
            mounted = false
        }
    }, [])

    const matches = useCallback(
        (key: string, action: KeybindingAction) => isKeyForAction(key, action, keybindings),
        [keybindings]
    )

    return { keybindings, matches }
}
