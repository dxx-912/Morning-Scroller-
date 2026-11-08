import { useSyncExternalStore } from 'react'

/**
 * Where the app is running, for the "add to Home Screen" guide.
 *
 * - installed:  already opened from the Home Screen (or an installed app window)
 * - in-app:     inside Instagram's (or another app's) built-in browser, which
 *               can't add to the Home Screen; open it in the real browser first
 * - ios-safari: Safari on iPhone/iPad
 * - ios-other:  Chrome/Firefox/Edge on iPhone (they use the same Share sheet)
 * - android:    Chrome and friends on Android
 * - desktop:    a computer; the guide shows a QR code to open it on a phone
 */
export type Platform = 'installed' | 'in-app' | 'ios-safari' | 'ios-other' | 'android' | 'desktop'

const PLATFORMS: Platform[] = ['installed', 'in-app', 'ios-safari', 'ios-other', 'android', 'desktop']

export function detectPlatform(nav: Navigator = navigator, win: Window = window): Platform {
  // In development, ?platform=ios-safari (etc.) previews another platform's guide.
  if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV && win.location) {
    const forced = new URLSearchParams(win.location.search).get('platform') as Platform | null
    if (forced && PLATFORMS.includes(forced)) return forced
  }
  const ua = nav.userAgent
  const standalone = win.matchMedia?.('(display-mode: standalone)').matches || (nav as Navigator & { standalone?: boolean }).standalone === true
  if (standalone) return 'installed'
  if (/Instagram|FBAN|FBAV|FB_IAB|Threads|musical_ly|Bytedance|Snapchat|Pinterest|Line\//i.test(ua)) return 'in-app'
  // iPadOS reports itself as a Mac; touch support gives it away.
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && nav.maxTouchPoints > 1)
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) ? 'ios-other' : 'ios-safari'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

// ---------- Android/desktop Chrome's own install prompt ----------

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

// Chrome fires this once, early. Keep it so a button can show the prompt later.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    installed = true
    notify()
  })
}

/** Chrome's one-tap install, when it's offered. `install()` resolves true if they accepted. */
export function useInstallPrompt() {
  const state = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => (installed ? 'installed' : deferred ? 'available' : 'unavailable'),
  )
  const install = async () => {
    const e = deferred
    if (!e) return false
    await e.prompt()
    const { outcome } = await e.userChoice
    deferred = null
    if (outcome === 'accepted') installed = true
    notify()
    return outcome === 'accepted'
  }
  return { state, install }
}
