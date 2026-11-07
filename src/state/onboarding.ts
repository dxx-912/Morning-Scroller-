import { useCallback, useSyncExternalStore } from 'react'
import { getMeta, setMeta } from '../lib/db'

/**
 * Remembers which one-time screens this person has seen: the intro and the
 * first-visit feed tip.
 *
 * There are no accounts, so "this person" means this browser on this device.
 * It's saved in two places so that one being cleared doesn't bring the intro
 * back: localStorage (read instantly, so there's no flash on launch) and the
 * IndexedDB store that holds the library. Anyone who already has a library
 * (an existing user, or someone who just restored a backup) counts as having
 * seen the intro; the app shell marks that.
 *
 * Bump INTRO_VERSION only when the intro changes enough that everyone should
 * see it again.
 */
export const INTRO_VERSION = 1

interface Seen {
  /** Intro version they finished or skipped, and when. */
  intro?: { version: number; at: number }
  /** When they dismissed the first-visit feed tip. */
  feedTip?: number
}

interface State {
  /** False until the IndexedDB copy has been read (only matters if localStorage had nothing). */
  loaded: boolean
  seen: Seen
  /** Showing the intro again from Settings. Not saved. */
  replaying: boolean
}

const LS_KEY = 'saved-feed:onboarding'
const META_KEY = 'onboarding'
const listeners = new Set<() => void>()

function readLocal(): Seen {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as Seen
  } catch {
    return {}
  }
}

let state: State = (() => {
  const seen = readLocal()
  // localStorage already says they've seen the intro: no need to wait for IndexedDB.
  return { loaded: introDone(seen), seen, replaying: false }
})()

function introDone(seen: Seen): boolean {
  return (seen.intro?.version ?? 0) >= INTRO_VERSION
}

function set(next: Partial<State>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

function save(seen: Seen) {
  set({ seen })
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(seen))
  } catch {
    /* private mode or storage blocked: IndexedDB still has it */
  }
  setMeta(META_KEY, seen).catch(() => {})
}

// Merge in the IndexedDB copy, and repair whichever copy is missing.
function mergeStored(stored: Seen | undefined) {
  const local = state.seen
  const merged: Seen = {
    intro: [local.intro, stored?.intro].filter((x) => !!x).sort((a, b) => b!.version - a!.version)[0],
    feedTip: local.feedTip ?? stored?.feedTip,
  }
  set({ loaded: true })
  const same = (a: Seen | undefined, b: Seen | undefined) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {})
  if (!same(merged, local) || !same(merged, stored)) save(merged)
}

// Never hold up launch on IndexedDB: if it doesn't answer quickly, go with
// what localStorage says, and merge the stored copy in whenever it arrives.
const STORAGE_WAIT_MS = 1500
const waitTimer = setTimeout(() => set({ loaded: true }), STORAGE_WAIT_MS)
getMeta<Seen>(META_KEY)
  .then(mergeStored, () => set({ loaded: true }))
  .finally(() => clearTimeout(waitTimer))

export function useOnboarding() {
  const s = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )

  const finishIntro = useCallback(() => {
    save({ ...state.seen, intro: { version: INTRO_VERSION, at: Date.now() } })
    set({ replaying: false })
  }, [])
  const replayIntro = useCallback(() => set({ replaying: true }), [])
  const dismissFeedTip = useCallback(() => save({ ...state.seen, feedTip: Date.now() }), [])

  return {
    /** Undefined while still reading storage. */
    introSeen: s.loaded ? introDone(s.seen) : undefined,
    replaying: s.replaying,
    feedTipSeen: !!s.seen.feedTip,
    finishIntro,
    replayIntro,
    dismissFeedTip,
  }
}
