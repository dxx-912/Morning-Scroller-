/**
 * The video lookup server on its own, for a deployed copy of the app:
 *
 *   npm run video-server
 *
 * Put it behind an HTTPS tunnel (Tailscale Funnel or Cloudflare Tunnel) and
 * build the app with VITE_VIDEO_API_URL set to that address. See the README.
 *
 * Env:
 *   PORT             default 8787
 *   ALLOWED_ORIGINS  comma-separated sites allowed to call it, e.g.
 *                    https://saved-feed.vercel.app. Localhost is always allowed.
 */
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { COOKIE_FILE, handle } from './videoApi.ts'

const PORT = Number(process.env.PORT ?? 8787)
const allowed = new Set(
  (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean),
)
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.\d+\.\d+\.\d+)(:\d+)?$/

function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true // direct visits and curl
  return allowed.has(origin) || LOCAL.test(origin)
}

const server = createServer((req, res) => {
  const origin = req.headers.origin
  if (!originAllowed(origin)) {
    res.statusCode = 403
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ type: 'embed', reason: 'failed' }))
  }
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET')
    res.statusCode = 204
    return res.end()
  }
  if (req.url === '/health') {
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ ok: true, login: existsSync(COOKIE_FILE) }))
  }
  void handle(req, res, () => {
    res.statusCode = 404
    res.end('Not found')
  })
})

server.listen(PORT, () => {
  console.log(`Video server on http://localhost:${PORT}`)
  if (!existsSync(COOKIE_FILE)) console.warn(`No Instagram login at ${COOKIE_FILE}: every post will use the embed.`)
  if (!allowed.size) console.warn('ALLOWED_ORIGINS is empty: only localhost/LAN pages can use this server.')
  else console.log(`Allowed sites: ${[...allowed].join(', ')}`)
})
