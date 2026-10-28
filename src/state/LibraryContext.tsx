import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as db from '../lib/db'
import { ALL } from '../lib/feed'
import { makeBackup, mergeInstagramImport, mergeSnapshots, type Backup, type ImportStats } from '../lib/library'
import { todayKey } from '../lib/shuffle'
import type { Category, LibrarySnapshot, ParseResult, Post, PostStatus } from '../lib/types'
import { hueFor, makeId } from '../lib/util'

interface LibraryValue {
  ready: boolean
  posts: Post[]
  categories: Category[]
  byCode: Map<string, Post>
  /** Today's date key; updates when the app is reopened on a new day. */
  today: string
  /** Today's chosen category, or null if not chosen yet today. */
  todayCategory: string | null
  /** Shortcode to resume the feed at. */
  resumeAt: string | undefined

  chooseCategory(id: string | null): void
  savePosition(shortcode: string): void

  importInstagram(parsed: ParseResult): Promise<ImportStats>
  importBackup(lib: LibrarySnapshot, mode: 'merge' | 'replace'): Promise<void>
  exportBackup(): Backup
  resetAll(): Promise<void>

  createCategory(name: string): Promise<Category>
  renameCategory(id: string, name: string): Promise<void>
  deleteCategory(id: string): Promise<void>

  /** Add and/or remove categories on many posts at once. */
  updatePostCategories(codes: string[], add: string[], remove: string[]): Promise<void>
  setStatus(code: string, status: PostStatus): Promise<void>
  deletePosts(codes: string[]): Promise<void>
}

const Ctx = createContext<LibraryValue | null>(null)

export function useLibrary(): LibraryValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useLibrary must be used inside <LibraryProvider>')
  return v
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [lib, setLib] = useState<LibrarySnapshot>({ posts: [], categories: [] })
  const [today, setToday] = useState(todayKey)
  const [day, setDay] = useState<db.DayState | null>(null)
  // Latest library for async actions, so they never act on a stale render.
  const libRef = useRef(lib)
  libRef.current = lib

  useEffect(() => {
    Promise.all([db.loadLibrary(), db.getMeta<db.DayState>('day')]).then(([l, d]) => {
      setLib(l)
      setDay(d ?? null)
      setReady(true)
    })
    db.requestPersistence()
  }, [])

  // Notice midnight: when the app comes back to the foreground on a new day.
  useEffect(() => {
    const check = () => setToday(todayKey())
    const t = setInterval(check, 60_000)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  const commit = useCallback((next: LibrarySnapshot) => {
    libRef.current = next
    setLib(next)
  }, [])

  // Yesterday's state (or an old format) doesn't count.
  const todayState = day && day.day === today && day.positions ? day : null
  const chosen = todayState?.categoryId ?? null
  // A category that has since been deleted no longer counts as chosen.
  const todayCategory = chosen && (chosen === ALL || chosen === 'uncategorized' || lib.categories.some((c) => c.id === chosen)) ? chosen : null

  const chooseCategory = useCallback(
    (id: string | null) => {
      setDay((d) => {
        const positions = d && d.day === today && d.positions ? d.positions : {}
        const next: db.DayState = { day: today, categoryId: id, positions }
        db.setMeta('day', next)
        return next
      })
    },
    [today],
  )

  const posTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const savePosition = useCallback((shortcode: string) => {
    setDay((d) => {
      if (!d?.categoryId || d.positions[d.categoryId] === shortcode) return d
      const next = { ...d, positions: { ...d.positions, [d.categoryId]: shortcode } }
      clearTimeout(posTimer.current)
      posTimer.current = setTimeout(() => db.setMeta('day', next), 400)
      return next
    })
  }, [])

  const value = useMemo<LibraryValue>(() => {
    const byCode = new Map(lib.posts.map((p) => [p.shortcode, p]))

    const patchPosts = async (changed: Post[]) => {
      if (changed.length === 0) return
      const map = new Map(changed.map((p) => [p.shortcode, p]))
      const cur = libRef.current
      commit({ ...cur, posts: cur.posts.map((p) => map.get(p.shortcode) ?? p) })
      await db.putPosts(changed)
    }

    return {
      ready,
      posts: lib.posts,
      categories: lib.categories,
      byCode,
      today,
      todayCategory,
      resumeAt: todayCategory ? todayState?.positions[todayCategory] : undefined,
      chooseCategory,
      savePosition,

      async importInstagram(parsed) {
        const { next, stats } = mergeInstagramImport(libRef.current, parsed)
        await db.replaceLibrary(next)
        commit(next)
        return stats
      },

      async importBackup(incoming, mode) {
        const next = mode === 'replace' ? incoming : mergeSnapshots(libRef.current, incoming)
        await db.replaceLibrary(next)
        commit(next)
      },

      exportBackup: () => makeBackup(libRef.current),

      async resetAll() {
        await db.clearEverything()
        commit({ posts: [], categories: [] })
        setDay(null)
      },

      async createCategory(name) {
        const cat: Category = { id: makeId('c-'), name: name.trim(), source: 'user', hue: hueFor(name.trim() + Date.now()), createdAt: Date.now() }
        await db.putCategory(cat)
        const cur = libRef.current
        commit({ ...cur, categories: [...cur.categories, cat] })
        return cat
      },

      async renameCategory(id, name) {
        const cur = libRef.current
        const cat = cur.categories.find((c) => c.id === id)
        if (!cat || !name.trim()) return
        const next = { ...cat, name: name.trim() }
        await db.putCategory(next)
        commit({ ...cur, categories: cur.categories.map((c) => (c.id === id ? next : c)) })
      },

      async deleteCategory(id) {
        const cur = libRef.current
        const affected = cur.posts.filter((p) => p.categoryIds.includes(id)).map((p) => ({ ...p, categoryIds: p.categoryIds.filter((c) => c !== id) }))
        await db.deleteCategory(id, affected)
        const map = new Map(affected.map((p) => [p.shortcode, p]))
        commit({ categories: cur.categories.filter((c) => c.id !== id), posts: cur.posts.map((p) => map.get(p.shortcode) ?? p) })
      },

      async updatePostCategories(codes, add, remove) {
        const cur = new Map(libRef.current.posts.map((p) => [p.shortcode, p]))
        const changed: Post[] = []
        for (const code of codes) {
          const p = cur.get(code)
          if (!p) continue
          const ids = new Set(p.categoryIds)
          add.forEach((id) => ids.add(id))
          remove.forEach((id) => ids.delete(id))
          if (ids.size !== p.categoryIds.length || [...ids].some((id) => !p.categoryIds.includes(id))) {
            changed.push({ ...p, categoryIds: [...ids] })
          }
        }
        await patchPosts(changed)
      },

      async setStatus(code, status) {
        const p = libRef.current.posts.find((x) => x.shortcode === code)
        if (!p || p.status === status) return
        await patchPosts([{ ...p, status, statusAt: Date.now() }])
      },

      async deletePosts(codes) {
        const drop = new Set(codes)
        const cur = libRef.current
        commit({ ...cur, posts: cur.posts.filter((p) => !drop.has(p.shortcode)) })
        await db.deletePosts(codes)
      },
    }
  }, [lib, ready, today, todayCategory, todayState, chooseCategory, savePosition, commit])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
