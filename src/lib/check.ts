import type { Post } from './types'

/** A second failed check must be at least this long after the first to count. */
export const STRIKE_GAP_MS = 20 * 60 * 1000

/** Posts the background check should look at: never seen, or failed once a while ago. */
export function needsCheck(p: Post, now: number): boolean {
  if (p.status === 'unavailable') return false
  if (p.checkFailedAt) return now - p.checkFailedAt >= STRIKE_GAP_MS
  return p.status === 'unknown'
}

/**
 * Apply one background check result. Returns the updated post, or null when
 * nothing changes.
 */
export function applyCheck(p: Post, ok: boolean, now: number): Post | null {
  if (p.status === 'unavailable') return null
  if (ok) {
    if (p.status === 'ok' && !p.checkFailedAt) return null
    return { ...p, status: 'ok', statusAt: now, checkFailedAt: undefined }
  }
  if (p.checkFailedAt && now - p.checkFailedAt >= STRIKE_GAP_MS) {
    return { ...p, status: 'unavailable', statusAt: now, checkFailedAt: undefined, unavailableReason: undefined }
  }
  if (p.checkFailedAt) return null // too soon to count again
  return { ...p, checkFailedAt: now }
}
