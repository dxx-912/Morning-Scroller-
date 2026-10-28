import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Category, LibrarySnapshot, Post } from './types'

/** Small key/value settings, e.g. today's chosen category and feed position. */
export interface DayState {
  /** YYYY-MM-DD */
  day: string
  /** Today's chosen category, or null while picking. */
  categoryId: string | null
  /** Last shortcode seen per category today, so reopening resumes there. */
  positions: Record<string, string>
}

interface SavedFeedDB extends DBSchema {
  posts: { key: string; value: Post; indexes: { status: string } }
  categories: { key: string; value: Category }
  meta: { key: string; value: unknown }
}

const DB_NAME = 'saved-feed'
let dbPromise: Promise<IDBPDatabase<SavedFeedDB>> | null = null

function db() {
  dbPromise ??= openDB<SavedFeedDB>(DB_NAME, 1, {
    upgrade(d) {
      const posts = d.createObjectStore('posts', { keyPath: 'shortcode' })
      posts.createIndex('status', 'status')
      d.createObjectStore('categories', { keyPath: 'id' })
      d.createObjectStore('meta')
    },
  })
  return dbPromise
}

export async function loadLibrary(): Promise<LibrarySnapshot> {
  const d = await db()
  const [posts, categories] = await Promise.all([d.getAll('posts'), d.getAll('categories')])
  return { posts, categories }
}

export async function putPosts(posts: Post[]): Promise<void> {
  if (posts.length === 0) return
  const tx = (await db()).transaction('posts', 'readwrite')
  await Promise.all([...posts.map((p) => tx.store.put(p)), tx.done])
}

export async function deletePosts(shortcodes: string[]): Promise<void> {
  if (shortcodes.length === 0) return
  const tx = (await db()).transaction('posts', 'readwrite')
  await Promise.all([...shortcodes.map((s) => tx.store.delete(s)), tx.done])
}

export async function putCategory(cat: Category): Promise<void> {
  await (await db()).put('categories', cat)
}

/** Delete a category and remove it from every post, atomically. */
export async function deleteCategory(id: string, affected: Post[]): Promise<void> {
  const tx = (await db()).transaction(['categories', 'posts'], 'readwrite')
  await Promise.all([
    tx.objectStore('categories').delete(id),
    ...affected.map((p) => tx.objectStore('posts').put(p)),
    tx.done,
  ])
}

/** Replace the entire library (used by imports). */
export async function replaceLibrary(lib: LibrarySnapshot): Promise<void> {
  const tx = (await db()).transaction(['categories', 'posts'], 'readwrite')
  const posts = tx.objectStore('posts')
  const cats = tx.objectStore('categories')
  await Promise.all([posts.clear(), cats.clear()])
  await Promise.all([...lib.posts.map((p) => posts.put(p)), ...lib.categories.map((c) => cats.put(c)), tx.done])
}

export async function clearEverything(): Promise<void> {
  const tx = (await db()).transaction(['categories', 'posts', 'meta'], 'readwrite')
  await Promise.all([tx.objectStore('posts').clear(), tx.objectStore('categories').clear(), tx.objectStore('meta').clear(), tx.done])
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('meta', key)) as T | undefined
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put('meta', value, key)
}

/** Ask the browser not to evict our data under storage pressure (important on iOS). */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
