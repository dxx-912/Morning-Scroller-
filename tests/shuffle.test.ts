import { describe, expect, it } from 'vitest'
import { feedSeed, seededShuffle, todayKey } from '../src/lib/shuffle'

const items = Array.from({ length: 50 }, (_, i) => `code${String(i).padStart(3, '0')}`)
const id = (s: string) => s

describe('seededShuffle', () => {
  it('is stable for the same seed, regardless of input order', () => {
    const seed = feedSeed('2026-10-28', 'all')
    const a = seededShuffle(items, seed, id)
    const b = seededShuffle([...items].reverse(), seed, id)
    expect(a).toEqual(b)
    expect([...a].sort()).toEqual(items)
  })

  it('changes with the day and with the category', () => {
    const base = seededShuffle(items, feedSeed('2026-10-28', 'all'), id)
    expect(seededShuffle(items, feedSeed('2026-10-29', 'all'), id)).not.toEqual(base)
    expect(seededShuffle(items, feedSeed('2026-10-28', 'recipes'), id)).not.toEqual(base)
  })

  it('actually mixes things up', () => {
    const out = seededShuffle(items, feedSeed('2026-10-28', 'all'), id)
    const inPlace = out.filter((v, i) => v === items[i]).length
    expect(inPlace).toBeLessThan(10)
  })
})

describe('todayKey', () => {
  it('uses the local date', () => {
    expect(todayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})
