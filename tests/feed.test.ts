import { describe, expect, it } from 'vitest'
import { ALL, UNCATEGORIZED, buildFeed, countPlayable } from '../src/lib/feed'
import type { Post } from '../src/lib/types'

const mk = (i: number, cats: string[] = []): Post => ({
  shortcode: `Code${String(i).padStart(4, '0')}`,
  kind: 'post',
  url: '',
  categoryIds: cats,
  status: 'unknown',
  addedAt: 0,
})

const posts = Array.from({ length: 40 }, (_, i) => mk(i, i % 2 ? ['a'] : i % 3 ? ['b'] : []))

describe('buildFeed', () => {
  it('filters by category', () => {
    expect(buildFeed(posts, ALL, '2026-10-28')).toHaveLength(40)
    expect(buildFeed(posts, 'a', '2026-10-28').every((p) => p.categoryIds.includes('a'))).toBe(true)
    expect(buildFeed(posts, UNCATEGORIZED, '2026-10-28').every((p) => p.categoryIds.length === 0)).toBe(true)
  })

  it('removing a dead post keeps the rest of the order', () => {
    const before = buildFeed(posts, ALL, '2026-10-28').map((p) => p.shortcode)
    const dead = before[5]
    const after = buildFeed(
      posts.map((p) => (p.shortcode === dead ? { ...p, status: 'unavailable' as const } : p)),
      ALL,
      '2026-10-28',
    ).map((p) => p.shortcode)
    expect(after).toEqual(before.filter((c) => c !== dead))
    expect(countPlayable(posts, ALL)).toBe(40)
  })

  it('is different tomorrow', () => {
    const a = buildFeed(posts, ALL, '2026-10-28').map((p) => p.shortcode)
    const b = buildFeed(posts, ALL, '2026-10-29').map((p) => p.shortcode)
    expect(a).not.toEqual(b)
  })
})
