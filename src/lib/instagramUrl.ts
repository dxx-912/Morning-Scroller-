import type { PostKind } from './types'

export interface PostRef {
  shortcode: string
  kind: PostKind
  url: string
}

// Matches instagram.com/p/X, /reel/X, /reels/X, /tv/X, optionally with a
// username segment first (instagram.com/someone/p/X) and on instagr.am.
const POST_URL =
  /^(?:https?:\/\/)?(?:www\.|m\.)?(?:instagram\.com|instagr\.am)\/(?:[A-Za-z0-9._]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]{5,64})/i

const KIND: Record<string, PostKind> = { p: 'post', reel: 'reel', reels: 'reel', tv: 'igtv' }

/** Parse an Instagram post/reel URL. Returns null for profiles, stories, etc. */
export function parsePostUrl(raw: string): PostRef | null {
  if (typeof raw !== 'string') return null
  const m = POST_URL.exec(raw.trim())
  if (!m) return null
  const kind = KIND[m[1].toLowerCase()]
  const shortcode = m[2]
  return { shortcode, kind, url: permalink(shortcode, kind) }
}

export function permalink(shortcode: string, kind: PostKind): string {
  return `https://www.instagram.com/${kind === 'reel' ? 'reel' : 'p'}/${shortcode}/`
}

/** The official embed page for a post, rendered inside an iframe. */
export function embedUrl(shortcode: string, kind: PostKind, captioned = false): string {
  return `${permalink(shortcode, kind)}embed/${captioned ? 'captioned/' : ''}`
}

/** True if the string looks like any instagram.com URL (used to skip non-post links). */
export function isInstagramUrl(raw: string): boolean {
  return /^(?:https?:\/\/)?(?:www\.|m\.)?(?:instagram\.com|instagr\.am)\//i.test(raw)
}
