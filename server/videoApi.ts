import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

/**
 * Local video lookup for the feed: GET /api/video/:shortcode
 *
 * Runs yt-dlp with the Instagram login saved in .secrets/ig-cookies.txt and
 * returns a direct .mp4 link the app plays in its own <video> player.
 * Anything that isn't a single video (photos, carousels, errors) tells the app
 * to fall back to Instagram's normal embed.
 *
 * Runs inside `npm run dev` / `npm run preview`, or on its own with
 * `npm run video-server` (server/standalone.ts) so a deployed copy of the app
 * can use it too. Without either, the app just uses embeds.
 */

export const COOKIE_FILE = resolve('.secrets/ig-cookies.txt')

export type VideoResult =
  | { type: 'video'; url: string; width?: number; height?: number; poster?: string }
  | { type: 'embed'; reason: 'not-video' | 'no-login' | 'login-expired' | 'no-ytdlp' | 'failed' }

/** Instagram's CDN links last for days; refresh well before that. */
const OK_TTL_MS = 60 * 60 * 1000
const MISS_TTL_MS = 10 * 60 * 1000
const SHORTCODE = /^[A-Za-z0-9_-]{5,64}$/

const cache = new Map<string, { at: number; result: VideoResult }>()
const inFlight = new Map<string, Promise<VideoResult>>()
// yt-dlp rewrites the cookie file when it exits, so run one at a time.
// That's also gentler on Instagram's rate limits.
let queue: Promise<unknown> = Promise.resolve()

export function lookupVideo(shortcode: string, fresh = false): Promise<VideoResult> {
  if (fresh) cache.delete(shortcode)
  const hit = cache.get(shortcode)
  if (hit && Date.now() - hit.at < (hit.result.type === 'video' ? OK_TTL_MS : MISS_TTL_MS)) {
    return Promise.resolve(hit.result)
  }
  const pending = inFlight.get(shortcode)
  if (pending) return pending

  const job = queue.then(() => runYtDlp(shortcode))
  queue = job.catch(() => {})
  const tracked = job.then((result) => {
    // Don't cache setup problems; they go away as soon as you fix them.
    if (result.type === 'video' || result.reason === 'not-video' || result.reason === 'failed') {
      cache.set(shortcode, { at: Date.now(), result })
    }
    return result
  }).finally(() => inFlight.delete(shortcode))
  inFlight.set(shortcode, tracked)
  return tracked
}

function runYtDlp(shortcode: string): Promise<VideoResult> {
  if (!existsSync(COOKIE_FILE)) return Promise.resolve({ type: 'embed', reason: 'no-login' })
  // /p/ works for reels too, and for regular posts that are videos.
  const url = `https://www.instagram.com/p/${shortcode}/`
  const args = ['--cookies', COOKIE_FILE, '-J', '--no-warnings', '--no-progress', '--socket-timeout', '15', url]

  return new Promise((done) => {
    execFile('yt-dlp', args, { timeout: 45_000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') return done({ type: 'embed', reason: 'no-ytdlp' })
      if (err) return done({ type: 'embed', reason: classifyError(String(stderr)) })
      try {
        done(pickVideo(JSON.parse(stdout)))
      } catch {
        done({ type: 'embed', reason: 'failed' })
      }
    })
  })
}

function classifyError(stderr: string): 'not-video' | 'login-expired' | 'failed' {
  const s = stderr.toLowerCase()
  if (s.includes('no video') || s.includes('there is no video')) return 'not-video'
  if (s.includes('login required') || s.includes('log in') || s.includes('cookies') || s.includes('checkpoint')) return 'login-expired'
  return 'failed'
}

interface YtFormat {
  format_id?: string
  url?: string
  ext?: string
  vcodec?: string | null
  acodec?: string | null
  height?: number | null
  width?: number | null
  protocol?: string
}
interface YtInfo {
  _type?: string
  formats?: YtFormat[]
  width?: number
  height?: number
  thumbnail?: string
}

/** Choose one progressive .mp4 that has both picture and sound. */
function pickVideo(info: YtInfo): VideoResult {
  // Carousels come back as playlists; the embed handles swiping between items.
  if (info._type === 'playlist' || !info.formats?.length) return { type: 'embed', reason: 'not-video' }
  const mp4s = info.formats.filter((f) => f.url && f.ext === 'mp4' && f.protocol?.startsWith('http') && f.vcodec !== 'none')
  // DASH pieces are video-only or audio-only; the full files list no audio codec.
  const withSound = mp4s.filter((f) => f.acodec !== 'none')
  // Silent reels have no audio anywhere. If sound exists only as a separate
  // track, a video-only file would play silently, so use the embed instead.
  const hasSeparateAudio = info.formats.some((f) => f.vcodec === 'none' && f.acodec && f.acodec !== 'none')
  const playable = withSound.length ? withSound : hasSeparateAudio ? [] : preferFull(mp4s)
  if (!playable.length) return { type: 'embed', reason: 'not-video' }
  const best = playable.reduce((a, b) => ((b.height ?? 0) > (a.height ?? 0) && (b.height ?? 0) <= 1920 ? b : a))
  return {
    type: 'video',
    url: best.url!,
    width: best.width ?? info.width,
    height: best.height ?? info.height,
    poster: info.thumbnail,
  }
}

/** Full files over DASH pieces when both exist. */
function preferFull(formats: YtFormat[]): YtFormat[] {
  const full = formats.filter((f) => !f.format_id?.startsWith('dash-'))
  return full.length ? full : formats
}

export async function handle(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const m = /^\/api\/video\/([^/?#]+)/.exec(req.url ?? '')
  if (!m) return next()
  let code: string
  try {
    code = decodeURIComponent(m[1])
  } catch {
    code = ''
  }
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  if (!SHORTCODE.test(code)) {
    res.statusCode = 400
    return res.end(JSON.stringify({ type: 'embed', reason: 'failed' }))
  }
  // ?fresh=1 skips the cache, for when the app's link stopped working.
  const fresh = /[?&]fresh=1\b/.test(req.url ?? '')
  const result = await lookupVideo(code, fresh)
  res.end(JSON.stringify(result))
}

export function videoApi(): Plugin {
  return {
    name: 'saved-feed-video-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => void handle(req, res, next))
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => void handle(req, res, next))
    },
  }
}
