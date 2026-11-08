import { describe, expect, it } from 'vitest'
import { detectPlatform } from '../src/lib/platform'

const win = (standalone = false) => ({ matchMedia: () => ({ matches: standalone }) }) as unknown as Window
const nav = (userAgent: string, extra: Partial<Navigator & { standalone: boolean }> = {}) => ({ userAgent, maxTouchPoints: 0, ...extra }) as unknown as Navigator

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1'
const IPHONE_INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 400.0.0.0 (iPhone16,2; iOS 26_0; en_US)'
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15'
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36'
const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'

describe('detectPlatform', () => {
  it('knows when it was opened from the Home Screen', () => {
    expect(detectPlatform(nav(IPHONE_SAFARI), win(true))).toBe('installed')
    expect(detectPlatform(nav(IPHONE_SAFARI, { standalone: true }), win())).toBe('installed')
  })
  it('tells iPhone browsers apart', () => {
    expect(detectPlatform(nav(IPHONE_SAFARI), win())).toBe('ios-safari')
    expect(detectPlatform(nav(IPHONE_CHROME), win())).toBe('ios-other')
  })
  it("spots Instagram's built-in browser", () => {
    expect(detectPlatform(nav(IPHONE_INSTAGRAM), win())).toBe('in-app')
  })
  it('treats a touch "Mac" as an iPad', () => {
    expect(detectPlatform(nav(IPAD, { maxTouchPoints: 5 }), win())).toBe('ios-safari')
    expect(detectPlatform(nav(IPAD), win())).toBe('desktop')
  })
  it('handles Android and computers', () => {
    expect(detectPlatform(nav(ANDROID_CHROME), win())).toBe('android')
    expect(detectPlatform(nav(MAC_CHROME), win())).toBe('desktop')
  })
})
