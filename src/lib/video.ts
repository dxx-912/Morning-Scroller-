/**
 * Asks the video server (server/videoApi.ts) for a playable .mp4.
 * Anything other than a video, including "no server here" on a static deploy,
 * means: use Instagram's embed instead.
 *
 * Uses the same site's /api by default (npm run dev / preview). A deployed
 * build points VITE_VIDEO_API_URL at the standalone server instead.
 */

const API_BASE = (import.meta.env.VITE_VIDEO_API_URL ?? '').replace(/\/$/, '')

/**
 * Logged-in video lookups are off unless VITE_VIDEO_LOOKUPS=1. Instagram
 * flagged the lookup account as a bot, so by default every post uses the
 * official embed and nothing logs into Instagram.
 */
export const VIDEO_LOOKUPS = import.meta.env.VITE_VIDEO_LOOKUPS === '1'

export type VideoSource =
  | { type: 'video'; url: string; width?: number; height?: number; poster?: string }
  | { type: 'embed'; reason: string }

const cache = new Map<string, Promise<VideoSource>>()
/** Once the server is missing, stop asking for the rest of the session. */
let serverMissing = false

export function getVideo(shortcode: string, fresh = false): Promise<VideoSource> {
  if (!VIDEO_LOOKUPS) return Promise.resolve({ type: 'embed', reason: 'disabled' })
  if (serverMissing) return Promise.resolve({ type: 'embed', reason: 'no-server' })
  let p = cache.get(shortcode)
  if (!p || fresh) {
    p = fetchVideo(shortcode, fresh)
    cache.set(shortcode, p)
    // Retry setup problems and network blips next time this post comes up.
    p.then((r) => {
      if (r.type === 'embed' && r.reason !== 'not-video') cache.delete(shortcode)
    })
  }
  return p
}

async function fetchVideo(shortcode: string, fresh: boolean): Promise<VideoSource> {
  try {
    const url = `${API_BASE}/api/video/${encodeURIComponent(shortcode)}${fresh ? '?fresh=1' : ''}`
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    const type = res.headers.get('content-type') ?? ''
    if (!type.includes('application/json')) {
      // A static host answers with index.html: there's no video server.
      serverMissing = true
      return { type: 'embed', reason: 'no-server' }
    }
    return (await res.json()) as VideoSource
  } catch {
    return { type: 'embed', reason: 'failed' }
  }
}

/** Where the password-protected login refresh page lives. Only the Vercel deploy has one. */
export const REFRESH_URL = VIDEO_LOOKUPS && !import.meta.env.DEV && !API_BASE ? '/api/login-refresh' : null

export type LoginStatus = 'ok' | 'login-expired' | 'no-login' | 'no-ytdlp' | 'no-server' | 'unknown'

/**
 * Checks whether video lookups work, by looking up a few of your reels live
 * (skipping every cache). Stops at the first clear answer.
 */
export async function checkLogin(shortcodes: string[]): Promise<LoginStatus> {
  for (const code of shortcodes.slice(0, 3)) {
    try {
      const url = `${API_BASE}/api/video/${encodeURIComponent(code)}?fresh=${Date.now()}`
      const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(60_000) })
      if (!(res.headers.get('content-type') ?? '').includes('application/json')) return 'no-server'
      const r = (await res.json()) as VideoSource
      if (r.type === 'video') {
        cache.delete(code)
        return 'ok'
      }
      if (r.reason === 'login-expired' || r.reason === 'no-login' || r.reason === 'no-ytdlp') {
        return r.reason
      }
      // 'not-video' or 'failed': that reel tells us nothing; try the next one.
    } catch {
      // Network blip: try the next one.
    }
  }
  return 'unknown'
}

/** Forget cached embed fallbacks so the feed asks again after a fix. */
export function clearVideoCache() {
  cache.clear()
  serverMissing = false
}
