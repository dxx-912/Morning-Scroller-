import { describe, expect, it } from 'vitest'
import { parsePostUrl, embedUrl } from '../src/lib/instagramUrl'
import { fixText, parseInstagramExport } from '../src/lib/parser'
import { fixture } from './helpers'

describe('parsePostUrl', () => {
  it.each([
    ['https://www.instagram.com/p/Cabc123XYZ_/', 'Cabc123XYZ_', 'post'],
    ['https://www.instagram.com/reel/Cabc123XYZ-/?igsh=xyz', 'Cabc123XYZ-', 'reel'],
    ['https://instagram.com/reels/Cabc123XYZ', 'Cabc123XYZ', 'reel'],
    ['http://instagr.am/p/Cabc123XYZ', 'Cabc123XYZ', 'post'],
    ['https://www.instagram.com/tv/Babc123XYZ/', 'Babc123XYZ', 'igtv'],
    ['https://www.instagram.com/some.user/p/Cabc123XYZ/', 'Cabc123XYZ', 'post'],
    ['https://m.instagram.com/p/Cabc123XYZ/', 'Cabc123XYZ', 'post'],
  ])('%s', (url, code, kind) => {
    expect(parsePostUrl(url)).toMatchObject({ shortcode: code, kind })
  })

  it('ignores non-post links', () => {
    expect(parsePostUrl('https://www.instagram.com/some.user/')).toBeNull()
    expect(parsePostUrl('https://www.instagram.com/stories/some.user/123/')).toBeNull()
    expect(parsePostUrl('https://example.com/p/Cabc123XYZ/')).toBeNull()
  })

  it('builds canonical and embed URLs', () => {
    const ref = parsePostUrl('https://instagram.com/reels/Cabc123XYZ?x=1')!
    expect(ref.url).toBe('https://www.instagram.com/reel/Cabc123XYZ/')
    expect(embedUrl(ref.shortcode, ref.kind)).toBe('https://www.instagram.com/reel/Cabc123XYZ/embed/')
    expect(embedUrl('Babc123XYZ', 'igtv')).toBe('https://www.instagram.com/p/Babc123XYZ/embed/')
  })
})

describe('fixText', () => {
  it('repairs Instagram mojibake', () => {
    expect(fixText('cafÃ©')).toBe('café')
    expect(fixText('Recipes ð\u009f\u008d\u009c')).toBe('Recipes 🍜')
  })
  it('leaves real text alone', () => {
    expect(fixText('café 🍜')).toBe('café 🍜')
    expect(fixText('Ã la carte')).toBe('Ã la carte') // not valid UTF-8 bytes, keep as is
  })
})

describe('parseInstagramExport: classic export', () => {
  const r = parseInstagramExport(fixture('classic'))
  const by = Object.fromEntries(r.posts.map((p) => [p.shortcode, p]))

  it('finds every unique post across both files', () => {
    expect(Object.keys(by).sort()).toEqual(['Bfake00004D', 'Cfake00001A', 'Cfake00002B', 'Cfake00003C', 'Cfake00005E', 'Cfake00006F'])
  })

  it('detects post types', () => {
    expect(by.Cfake00001A.kind).toBe('post')
    expect(by.Cfake00002B.kind).toBe('reel')
    expect(by.Cfake00003C.kind).toBe('reel')
    expect(by.Bfake00004D.kind).toBe('igtv')
    expect(r.report.byKind).toEqual({ post: 3, reel: 2, igtv: 1 })
  })

  it('keeps the earliest saved date and the author', () => {
    expect(by.Cfake00001A.savedAt).toBe(1716200000 * 1000)
    expect(by.Cfake00001A.author).toBe('fake.chef')
    expect(by.Cfake00003C.author).toBe('café.daily')
    expect(by.Cfake00006F.savedAt).toBe(1716700000 * 1000) // from collection "Added Time"
  })

  it('maps collections, including posts in several and empty ones', () => {
    expect(r.collections.map((c) => [c.name, c.count])).toEqual([
      ['Recipes 🍜', 2],
      ['Travel', 3],
      ['Empty one', 0],
    ])
    expect(by.Cfake00001A.collections).toEqual(['Recipes 🍜', 'Travel'])
    expect(by.Cfake00006F.collections).toEqual(['Travel'])
    expect(by.Cfake00005E.collections).toEqual([])
  })

  it('reports duplicates and skipped links', () => {
    expect(r.report.duplicates).toBe(2) // once in saved_posts, once in Recipes
    expect(r.report.skipped).toBe(1) // the profile link
    expect(r.report.files.map((f) => f.role)).toEqual(['saved_posts', 'collections'])
  })

  it('sorts newest first', () => {
    const times = r.posts.map((p) => p.savedAt ?? 0)
    expect([...times].sort((a, b) => b - a)).toEqual(times)
  })
})

describe('parseInstagramExport: other shapes', () => {
  it('reads the label_values format', () => {
    const r = parseInstagramExport(fixture('label-values'))
    expect(r.posts.map((p) => [p.shortcode, p.kind, p.author])).toEqual([
      ['DfakeLV002', 'reel', undefined],
      ['DfakeLV001', 'post', 'lv.owner'],
    ])
    expect(r.posts[1].savedAt).toBe(1730000000 * 1000)
    expect(r.report.duplicates).toBe(1)
    expect(r.collections).toEqual([])
  })

  it('reads nested collections without a saved_posts file', () => {
    const r = parseInstagramExport(fixture('nested'))
    expect(r.collections.map((c) => [c.name, c.count])).toEqual([
      ['Workouts', 2],
      ['Ideas', 2],
    ])
    const shared = r.posts.find((p) => p.shortcode === 'NfakeW0002')!
    expect(shared.collections).toEqual(['Workouts', 'Ideas'])
    expect(r.posts.find((p) => p.shortcode === 'NfakeI0001')!.author).toBe('idea.one')
  })

  it('explains legacy exports without links', () => {
    const r = parseInstagramExport(fixture('legacy'))
    expect(r.posts).toEqual([])
    expect(r.report.skipped).toBe(2)
    expect(r.report.warnings.join(' ')).toMatch(/none had a post link/i)
  })

  it('handles bad input gracefully', () => {
    const r = parseInstagramExport([
      { name: 'saved_posts.json', text: '{not json' },
      { name: 'saved_posts.html', text: '<html></html>' },
    ])
    expect(r.posts).toEqual([])
    expect(r.report.warnings).toHaveLength(3)
  })

  it('accepts a bare list of URLs and a wrapper with a different key', () => {
    const r = parseInstagramExport([
      { name: 'saved_posts.json', text: JSON.stringify({ data: { items: ['https://www.instagram.com/p/AAAAA11111/', 'https://www.instagram.com/reel/BBBBB22222/'] } }) },
    ])
    expect(r.posts.map((p) => p.shortcode).sort()).toEqual(['AAAAA11111', 'BBBBB22222'])
  })
})
