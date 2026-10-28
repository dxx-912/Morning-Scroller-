export type PostKind = 'post' | 'reel' | 'igtv'

/** Whether the Instagram embed is known to work. */
export type PostStatus = 'unknown' | 'ok' | 'unavailable'

export interface Post {
  /** Instagram shortcode, e.g. "C8x1AbCdEfG". Primary key. */
  shortcode: string
  kind: PostKind
  /** Canonical permalink, e.g. https://www.instagram.com/reel/C8x1AbCdEfG/ */
  url: string
  /** Account that posted it, when the export includes it. */
  author?: string
  /** When you saved it on Instagram (ms since epoch). */
  savedAt?: number
  /** Category ids. A post can be in any number of categories. */
  categoryIds: string[]
  status: PostStatus
  /** When status last changed (ms). */
  statusAt?: number
  /** When this post entered the app (ms). */
  addedAt: number
}

export interface Category {
  id: string
  name: string
  /** 'instagram' = created from a saved collection; 'user' = created in the app. */
  source: 'instagram' | 'user'
  /** Original collection name, used to match on re-import even after a rename. */
  igName?: string
  /** Hue 0-360 used for the category's accent color. */
  hue: number
  createdAt: number
}

/** All library data, as stored and as exported to a backup file. */
export interface LibrarySnapshot {
  posts: Post[]
  categories: Category[]
}

// ---------- Parser output ----------

export interface ParsedPost {
  shortcode: string
  kind: PostKind
  url: string
  author?: string
  savedAt?: number
  /** Names of Instagram collections this post belongs to. */
  collections: string[]
}

export interface ParsedCollection {
  name: string
  createdAt?: number
  count: number
}

export interface ParseReport {
  files: { name: string; role: 'saved_posts' | 'collections' | 'other'; records: number; format: string }[]
  /** Raw link records seen across all files, before dedupe. */
  linksSeen: number
  /** Records that pointed at the same post as an earlier record. */
  duplicates: number
  /** Records that had no usable post link (e.g. old exports with usernames only). */
  skipped: number
  byKind: Record<PostKind, number>
  warnings: string[]
}

export interface ParseResult {
  posts: ParsedPost[]
  collections: ParsedCollection[]
  report: ParseReport
}
