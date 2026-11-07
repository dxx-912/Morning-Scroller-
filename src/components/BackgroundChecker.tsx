import { useCallback, useEffect, useRef, useState } from 'react'
import { embedUrl } from '../lib/instagramUrl'
import type { Post } from '../lib/types'

/**
 * Finds deleted or private posts before you scroll to them, by loading their
 * embeds one at a time in a hidden iframe. Same signal the feed uses: a
 * working embed reports MEASURE or MOUNTED; a dead one loads Instagram's
 * "broken link" page and never does.
 *
 * Deliberately gentle, because Instagram shows that same "broken link" page
 * when it's rate-limiting: one post at a time with a pause between, a cap per
 * session, and if several fail in a row it stops for the session and doesn't
 * count those failures. A single failure is only a warning anyway (see
 * lib/check.ts).
 *
 * It can't spot reels that only play on Instagram; those embeds load normally.
 */

const GAP_MS = 2500
const MOUNT_GRACE_MS = 4000
/** No load at all by then: network trouble, not a dead post. Skip without counting. */
const LOAD_TIMEOUT_MS = 20000
const SESSION_CAP = 40
const STREAK_LIMIT = 3

// Per app session, shared across feed visits.
const checked = new Set<string>()
let stopped = false

interface Props {
  /** Posts to check, most urgent first. */
  candidates: Post[]
  onResult: (code: string, ok: boolean) => void
}

export function BackgroundChecker({ candidates, onResult }: Props) {
  const [target, setTarget] = useState<Post | null>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const loadHandler = useRef<() => void>(() => {})
  const candidatesRef = useRef(candidates)
  candidatesRef.current = candidates
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult
  // Failures wait here until a later success shows Instagram is answering normally.
  const pending = useRef<string[]>([])

  const flush = useCallback(() => {
    for (const code of pending.current) onResultRef.current(code, false)
    pending.current = []
  }, [])

  const pickNext = useCallback(() => {
    if (stopped || checked.size >= SESSION_CAP || !navigator.onLine) return
    const next = candidatesRef.current.find((p) => !checked.has(p.shortcode))
    if (!next) {
      flush()
      return
    }
    checked.add(next.shortcode)
    setTarget(next)
  }, [flush])

  // Idle: start the next check after a pause (and again whenever the list changes).
  useEffect(() => {
    if (target) return
    const t = setTimeout(() => {
      if (document.visibilityState === 'visible') pickNext()
    }, GAP_MS)
    const onVisible = () => document.visibilityState === 'visible' && pickNext()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [target, candidates, pickNext])

  // Checking: wait for Instagram's verdict on this one.
  useEffect(() => {
    if (!target) return
    const code = target.shortcode
    let done = false
    let grace: ReturnType<typeof setTimeout> | undefined

    const finish = (result: 'ok' | 'failed' | 'skipped') => {
      if (done) return
      done = true
      clearTimeout(grace)
      clearTimeout(timeout)
      if (result === 'ok') {
        flush()
        onResultRef.current(code, true)
      } else if (result === 'failed') {
        pending.current.push(code)
        if (pending.current.length >= STREAK_LIMIT) {
          // Probably rate-limited. Stop, and don't hold these against the posts.
          pending.current = []
          stopped = true
        }
      }
      setTarget(null)
    }

    const onMessage = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return
      if (!/^https:\/\/(www\.)?instagram\.com$/.test(e.origin)) return
      let msg: { type?: string }
      try {
        msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      } catch {
        return
      }
      if (msg?.type === 'MEASURE' || msg?.type === 'MOUNTED') finish('ok')
    }

    loadHandler.current = () => {
      clearTimeout(timeout)
      grace = setTimeout(() => finish(navigator.onLine ? 'failed' : 'skipped'), MOUNT_GRACE_MS)
    }
    const timeout = setTimeout(() => finish('skipped'), LOAD_TIMEOUT_MS)
    window.addEventListener('message', onMessage)
    return () => {
      done = true
      loadHandler.current = () => {}
      window.removeEventListener('message', onMessage)
      clearTimeout(grace)
      clearTimeout(timeout)
    }
  }, [target, flush])

  if (!target) return null
  return (
    <iframe
      key={target.shortcode}
      ref={frame}
      src={embedUrl(target.shortcode, target.kind, false)}
      onLoad={() => loadHandler.current()}
      title="Checking a post"
      aria-hidden
      tabIndex={-1}
      scrolling="no"
      referrerPolicy="strict-origin-when-cross-origin"
      style={{ position: 'fixed', left: -10000, top: 0, width: 326, height: 600, border: 0, pointerEvents: 'none' }}
    />
  )
}
