import { useCallback, useSyncExternalStore } from 'react'

/** Small per-device display preferences, kept in localStorage (not part of the library). */
export interface Settings {
  /** Use Instagram's captioned embed (shows the caption under the post). */
  captions: boolean
}

const KEY = 'saved-feed:settings'
const DEFAULTS: Settings = { captions: false }
const listeners = new Set<() => void>()
let cache: Settings | null = null

function read(): Settings {
  if (cache) return cache
  try {
    cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    cache = DEFAULTS
  }
  return cache!
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const settings = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    read,
    () => DEFAULTS,
  )
  const update = useCallback((patch: Partial<Settings>) => {
    cache = { ...read(), ...patch }
    try {
      localStorage.setItem(KEY, JSON.stringify(cache))
    } catch {
      /* private mode: keep it in memory */
    }
    listeners.forEach((l) => l())
  }, [])
  return [settings, update]
}
