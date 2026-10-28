import { feedSeed, seededShuffle } from './shuffle'
import type { Post } from './types'

/** Pseudo-categories that aren't stored in the database. */
export const ALL = 'all'
export const UNCATEGORIZED = 'uncategorized'

export function inCategory(post: Post, categoryId: string): boolean {
  if (categoryId === ALL) return true
  if (categoryId === UNCATEGORIZED) return post.categoryIds.length === 0
  return post.categoryIds.includes(categoryId)
}

/**
 * Today's feed for a category: shuffle every post in the category (including
 * unavailable ones), *then* drop unavailable posts. Shuffling first means
 * marking a post dead doesn't reorder the rest of today's feed.
 */
export function buildFeed(posts: readonly Post[], categoryId: string, day: string): Post[] {
  const pool = posts.filter((p) => inCategory(p, categoryId))
  return seededShuffle(pool, feedSeed(day, categoryId), (p) => p.shortcode).filter((p) => p.status !== 'unavailable')
}

export function countPlayable(posts: readonly Post[], categoryId: string): number {
  let n = 0
  for (const p of posts) if (p.status !== 'unavailable' && inCategory(p, categoryId)) n++
  return n
}
