import { describe, expect, it } from 'vitest'
import { applyCheck, needsCheck, STRIKE_GAP_MS } from '../src/lib/check'
import type { Post } from '../src/lib/types'

const post = (over: Partial<Post> = {}): Post => ({
  shortcode: 'Abc12345', kind: 'reel', url: 'https://www.instagram.com/reel/Abc12345/', categoryIds: [], status: 'unknown', addedAt: 0, ...over,
})

describe('background check', () => {
  it('marks a working post ok', () => {
    expect(applyCheck(post(), true, 5)).toMatchObject({ status: 'ok', statusAt: 5 })
  })

  it('needs two failures, far enough apart, to hide a post', () => {
    const once = applyCheck(post(), false, 1000)!
    expect(once).toMatchObject({ status: 'unknown', checkFailedAt: 1000 })
    expect(applyCheck(once, false, 1000 + 60_000)).toBeNull() // too soon
    expect(applyCheck(once, false, 1000 + STRIKE_GAP_MS)).toMatchObject({ status: 'unavailable', checkFailedAt: undefined })
  })

  it('a success clears an earlier failure', () => {
    const once = applyCheck(post(), false, 1000)!
    expect(applyCheck(once, true, 2000)).toMatchObject({ status: 'ok', checkFailedAt: undefined })
  })

  it('leaves unavailable posts alone', () => {
    expect(applyCheck(post({ status: 'unavailable', unavailableReason: 'watch-only' }), true, 1)).toBeNull()
  })

  it('picks unseen posts and failures due for a retry', () => {
    expect(needsCheck(post(), 0)).toBe(true)
    expect(needsCheck(post({ status: 'ok' }), 0)).toBe(false)
    expect(needsCheck(post({ status: 'unavailable' }), 0)).toBe(false)
    expect(needsCheck(post({ checkFailedAt: 100 }), 100 + 1000)).toBe(false)
    expect(needsCheck(post({ checkFailedAt: 100 }), 100 + STRIKE_GAP_MS)).toBe(true)
  })
})
