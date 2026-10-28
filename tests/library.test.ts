import { describe, expect, it } from 'vitest'
import { makeBackup, mergeInstagramImport, mergeSnapshots, readBackup } from '../src/lib/library'
import { parseInstagramExport } from '../src/lib/parser'
import type { LibrarySnapshot } from '../src/lib/types'
import { fixture } from './helpers'

const empty: LibrarySnapshot = { posts: [], categories: [] }

describe('mergeInstagramImport', () => {
  const parsed = parseInstagramExport(fixture('classic'))

  it('turns collections into categories', () => {
    const { next, stats } = mergeInstagramImport(empty, parsed, 1)
    expect(next.categories.map((c) => [c.name, c.source])).toEqual([
      ['Recipes 🍜', 'instagram'],
      ['Travel', 'instagram'],
      ['Empty one', 'instagram'],
    ])
    expect(stats.added).toBe(6)
    const recipes = next.categories[0].id
    expect(next.posts.find((p) => p.shortcode === 'Cfake00003C')!.categoryIds).toEqual([recipes])
  })

  it('re-importing keeps renames, manual categories and status', () => {
    const first = mergeInstagramImport(empty, parsed, 1).next
    const renamed = first.categories.map((c) => (c.name === 'Travel' ? { ...c, name: 'Trips' } : c))
    const posts = first.posts.map((p) =>
      p.shortcode === 'Cfake00005E' ? { ...p, categoryIds: ['mine'], status: 'unavailable' as const } : p,
    )
    const lib = { posts, categories: [...renamed, { id: 'mine', name: 'Mine', source: 'user' as const, hue: 1, createdAt: 1 }] }
    const { next, stats } = mergeInstagramImport(lib, parsed, 2)
    expect(next.categories).toHaveLength(4)
    expect(next.categories.find((c) => c.igName === 'Travel')!.name).toBe('Trips')
    const p = next.posts.find((x) => x.shortcode === 'Cfake00005E')!
    expect(p.categoryIds).toEqual(['mine'])
    expect(p.status).toBe('unavailable')
    expect(stats).toMatchObject({ added: 0, updated: 0, unchanged: 6, newCategories: [] })
  })
})

describe('backups', () => {
  const lib = mergeInstagramImport(empty, parseInstagramExport(fixture('classic')), 1).next

  it('round-trips through JSON', () => {
    const json = JSON.parse(JSON.stringify(makeBackup(lib)))
    expect(readBackup(json)).toEqual(lib)
  })

  it('rejects other files with a helpful message', () => {
    expect(() => readBackup({ saved_saved_media: [] })).toThrow(/Instagram export/)
    expect(() => readBackup({ hello: 1 })).toThrow(/not a Saved Feed backup/)
    expect(() => readBackup({ app: 'saved-feed', version: 99, posts: [], categories: [] })).toThrow(/newer version/)
  })

  it('drops invalid posts and unknown category ids', () => {
    const out = readBackup({
      app: 'saved-feed',
      version: 1,
      categories: [{ id: 'a', name: 'A' }],
      posts: [
        { shortcode: 'GoodCode1', kind: 'reel', categoryIds: ['a', 'zzz'] },
        { shortcode: 'bad code!' },
        { shortcode: 'GoodCode1' },
      ],
    })
    expect(out.posts).toHaveLength(1)
    expect(out.posts[0]).toMatchObject({ kind: 'reel', categoryIds: ['a'], status: 'unknown' })
  })

  it('merges two libraries', () => {
    const phone: LibrarySnapshot = {
      categories: [{ id: 'x', name: 'Phone only', source: 'user', hue: 0, createdAt: 0 }],
      posts: [{ ...lib.posts[0], categoryIds: ['x'], status: 'unavailable', statusAt: 99 }],
    }
    const out = mergeSnapshots(lib, phone)
    expect(out.categories).toHaveLength(lib.categories.length + 1)
    const p = out.posts.find((q) => q.shortcode === lib.posts[0].shortcode)!
    expect(p.categoryIds).toContain('x')
    expect(p.status).toBe('unavailable')
  })
})
