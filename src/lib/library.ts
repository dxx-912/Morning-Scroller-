import type { Category, LibrarySnapshot, ParseResult, Post, PostKind, PostStatus } from './types'
import { collectionCategoryId, hueFor } from './util'

export interface ImportStats {
  added: number
  updated: number
  unchanged: number
  newCategories: string[]
}

/**
 * Merge a parsed Instagram export into the library.
 * Existing posts keep their status and your manual categories; collection
 * memberships from the export are added on top.
 */
export function mergeInstagramImport(
  lib: LibrarySnapshot,
  parsed: ParseResult,
  now = Date.now(),
): { next: LibrarySnapshot; stats: ImportStats } {
  const categories = lib.categories.map((c) => ({ ...c }))
  const byIgName = new Map(categories.filter((c) => c.igName).map((c) => [c.igName!.toLowerCase(), c]))
  const collectionToId = new Map<string, string>()
  const newCategories: string[] = []

  for (const col of parsed.collections) {
    let cat = byIgName.get(col.name.toLowerCase())
    if (!cat) {
      let id = collectionCategoryId(col.name)
      while (categories.some((c) => c.id === id)) id += 'x'
      cat = { id, name: col.name, source: 'instagram', igName: col.name, hue: hueFor(col.name), createdAt: col.createdAt ?? now }
      categories.push(cat)
      byIgName.set(col.name.toLowerCase(), cat)
      newCategories.push(col.name)
    }
    collectionToId.set(col.name, cat.id)
  }

  const posts = new Map(lib.posts.map((p) => [p.shortcode, { ...p, categoryIds: [...p.categoryIds] }]))
  const stats: ImportStats = { added: 0, updated: 0, unchanged: 0, newCategories }

  for (const pp of parsed.posts) {
    const catIds = pp.collections.map((n) => collectionToId.get(n)).filter((id): id is string => !!id)
    const existing = posts.get(pp.shortcode)
    if (!existing) {
      posts.set(pp.shortcode, {
        shortcode: pp.shortcode,
        kind: pp.kind,
        url: pp.url,
        author: pp.author,
        savedAt: pp.savedAt,
        categoryIds: catIds,
        status: 'unknown',
        addedAt: now,
      })
      stats.added++
      continue
    }
    let changed = false
    for (const id of catIds) {
      if (!existing.categoryIds.includes(id)) {
        existing.categoryIds.push(id)
        changed = true
      }
    }
    if (!existing.author && pp.author) (existing.author = pp.author), (changed = true)
    if (!existing.savedAt && pp.savedAt) (existing.savedAt = pp.savedAt), (changed = true)
    if (changed) stats.updated++
    else stats.unchanged++
  }

  return { next: { categories, posts: [...posts.values()] }, stats }
}

// ---------------------------------------------------------------------------
// Backup files

export const BACKUP_APP = 'saved-feed'
export const BACKUP_VERSION = 1

export interface Backup extends LibrarySnapshot {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string
}

export function makeBackup(lib: LibrarySnapshot, now = new Date()): Backup {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), categories: lib.categories, posts: lib.posts }
}

const KINDS: PostKind[] = ['post', 'reel', 'igtv']
const STATUSES: PostStatus[] = ['unknown', 'ok', 'unavailable']

/** Validate and clean a backup file. Throws an Error with a readable message. */
export function readBackup(json: unknown): LibrarySnapshot {
  if (!json || typeof json !== 'object') throw new Error('This file is not a Saved Feed backup.')
  const b = json as Partial<Backup>
  if (b.app !== BACKUP_APP) {
    if ('saved_saved_media' in b || 'saved_saved_collections' in b) {
      throw new Error('This is an Instagram export, not a Saved Feed backup. Use "Import Instagram export" instead.')
    }
    throw new Error('This file is not a Saved Feed backup.')
  }
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    throw new Error('This backup was made by a newer version of Saved Feed.')
  }
  if (!Array.isArray(b.posts) || !Array.isArray(b.categories)) throw new Error('The backup is missing posts or categories.')

  const categories: Category[] = []
  const catIds = new Set<string>()
  for (const c of b.categories) {
    if (!c || typeof c.id !== 'string' || typeof c.name !== 'string' || catIds.has(c.id)) continue
    catIds.add(c.id)
    categories.push({
      id: c.id,
      name: c.name.trim() || 'Untitled',
      source: c.source === 'instagram' ? 'instagram' : 'user',
      igName: typeof c.igName === 'string' ? c.igName : undefined,
      hue: typeof c.hue === 'number' ? ((c.hue % 360) + 360) % 360 : hueFor(c.name),
      createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now(),
    })
  }

  const posts: Post[] = []
  const codes = new Set<string>()
  for (const p of b.posts) {
    if (!p || typeof p.shortcode !== 'string' || !/^[A-Za-z0-9_-]{5,64}$/.test(p.shortcode) || codes.has(p.shortcode)) continue
    codes.add(p.shortcode)
    const kind = KINDS.includes(p.kind) ? p.kind : 'post'
    posts.push({
      shortcode: p.shortcode,
      kind,
      url: typeof p.url === 'string' ? p.url : `https://www.instagram.com/${kind === 'reel' ? 'reel' : 'p'}/${p.shortcode}/`,
      author: typeof p.author === 'string' ? p.author : undefined,
      savedAt: typeof p.savedAt === 'number' ? p.savedAt : undefined,
      categoryIds: Array.isArray(p.categoryIds) ? [...new Set(p.categoryIds.filter((id) => catIds.has(id)))] : [],
      status: STATUSES.includes(p.status) ? p.status : 'unknown',
      statusAt: typeof p.statusAt === 'number' ? p.statusAt : undefined,
      addedAt: typeof p.addedAt === 'number' ? p.addedAt : Date.now(),
    })
  }
  return { categories, posts }
}

/** Combine two libraries. Categories match by id; post categories are unioned; the newer status wins. */
export function mergeSnapshots(base: LibrarySnapshot, incoming: LibrarySnapshot): LibrarySnapshot {
  const categories = new Map(base.categories.map((c) => [c.id, c]))
  for (const c of incoming.categories) if (!categories.has(c.id)) categories.set(c.id, c)

  const posts = new Map(base.posts.map((p) => [p.shortcode, p]))
  for (const p of incoming.posts) {
    const cur = posts.get(p.shortcode)
    if (!cur) {
      posts.set(p.shortcode, p)
      continue
    }
    const newer = (p.statusAt ?? 0) > (cur.statusAt ?? 0) ? p : cur
    posts.set(p.shortcode, {
      ...cur,
      author: cur.author ?? p.author,
      savedAt: cur.savedAt ?? p.savedAt,
      categoryIds: [...new Set([...cur.categoryIds, ...p.categoryIds])],
      status: newer.status,
      statusAt: newer.statusAt,
    })
  }
  return { categories: [...categories.values()], posts: [...posts.values()] }
}
