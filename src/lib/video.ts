/**
 * Asks the local video server (server/videoApi.ts) for a playable .mp4.
 * Anything other than a video, including "no server here" on a static deploy,
 * means: use Instagram's embed instead.
 */

export type VideoSource =
  | { type: 'video'; url: string; width?: number; height?: number; poster?: string }
  | { type: 'embed'; reason: string }

const cache = new Map<string, Promise<VideoSource>>()
/** Once the server is missing, stop asking for the rest of the session. */
let serverMissing = false

export function getVideo(shortcode: string, fresh = false): Promise<VideoSource> {
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
    const url = `/api/video/${encodeURIComponent(shortcode)}${fresh ? '?fresh=1' : ''}`
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
