import { useEffect, useRef, useState } from 'react'
import { embedUrl } from '../lib/instagramUrl'
import type { Post } from '../lib/types'
import { Button } from './Sheet'
import { IconExternal, IconFlag } from './icons'

/**
 * Instagram's official embed (https://www.instagram.com/p/CODE/embed/) in an iframe.
 *
 * How failures are detected (verified in Chrome): a working embed posts
 * `LOADING`, then `MEASURE {height}` and `MOUNTED` to the parent window before
 * the iframe's load event. A deleted or private post loads Instagram's
 * "link may be broken" page and only ever posts `LOADING`. So: iframe loaded +
 * no MEASURE/MOUNTED shortly after = unavailable.
 */

export type EmbedState = 'loading' | 'ok' | 'unavailable' | 'error'

const IG_MIN_WIDTH = 326
const IG_MAX_WIDTH = 540
/** How long to wait after the iframe's load event for Instagram to mount the post. */
const MOUNT_GRACE_MS = 4000
/** Give up if the iframe hasn't loaded at all (network trouble, not a dead post). */
const LOAD_TIMEOUT_MS = 25000

interface EmbedProps {
  post: Post
  /** Space available for the embed; it is scaled down to fit. */
  maxWidth: number
  maxHeight: number
  captioned?: boolean
  onState?: (state: EmbedState) => void
}

export function Embed({ post, maxWidth, maxHeight, captioned = false, onState }: EmbedProps) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [state, setState] = useState<EmbedState>('loading')
  const [height, setHeight] = useState<number | null>(null)
  const [attempt, setAttempt] = useState(0)
  const mounted = useRef(false)
  const onStateRef = useRef(onState)
  onStateRef.current = onState
  const loadHandler = useRef<() => void>(() => {})

  const width = Math.round(Math.min(IG_MAX_WIDTH, Math.max(IG_MIN_WIDTH, maxWidth)))
  // Rough guess until Instagram tells us the real height.
  const naturalHeight = height ?? Math.round(width * 1.25 + (captioned ? 260 : 180))
  const scale = Math.min(1, maxWidth / width, maxHeight / naturalHeight)

  useEffect(() => {
    mounted.current = false
    setState('loading')
    setHeight(null)
    let graceTimer: ReturnType<typeof setTimeout> | undefined

    const report = (s: EmbedState) => {
      setState(s)
      onStateRef.current?.(s)
    }

    const onMessage = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return
      if (!/^https:\/\/(www\.)?instagram\.com$/.test(e.origin)) return
      let msg: { type?: string; details?: { height?: number } }
      try {
        msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      } catch {
        return
      }
      if (msg?.type === 'MEASURE' && typeof msg.details?.height === 'number' && msg.details.height > 0) {
        setHeight(msg.details.height)
      }
      if ((msg?.type === 'MEASURE' || msg?.type === 'MOUNTED') && !mounted.current) {
        mounted.current = true
        clearTimeout(graceTimer)
        report('ok')
      }
    }

    const onLoad = () => {
      clearTimeout(loadTimer)
      if (mounted.current) return
      graceTimer = setTimeout(() => {
        if (mounted.current) return
        // Offline: the iframe "loads" an error page. Don't blame the post.
        report(navigator.onLine ? 'unavailable' : 'error')
      }, MOUNT_GRACE_MS)
    }

    const loadTimer = setTimeout(() => {
      if (!mounted.current) report('error')
    }, LOAD_TIMEOUT_MS)

    loadHandler.current = onLoad
    window.addEventListener('message', onMessage)
    return () => {
      loadHandler.current = () => {}
      window.removeEventListener('message', onMessage)
      clearTimeout(graceTimer)
      clearTimeout(loadTimer)
    }
  }, [post.shortcode, attempt, captioned])

  const boxW = Math.round(width * scale)
  const boxH = Math.round(naturalHeight * scale)

  return (
    <div className="relative" style={{ width: boxW, height: state === 'ok' ? boxH : Math.min(boxH, maxHeight) }}>
      {state !== 'ok' && (
        <div className="absolute inset-0 overflow-hidden rounded-2xl border border-ink-800 bg-ink-900">
          {state === 'loading' && <Skeleton />}
          {state === 'unavailable' && (
            <Notice
              title="This post is unavailable"
              body="It may have been deleted or made private. It's been moved to Settings → Unavailable posts."
              url={post.url}
            />
          )}
          {state === 'error' && (
            <Notice title="Couldn't load this post" body="Check your connection and try again." url={post.url}>
              <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>
                Retry
              </Button>
            </Notice>
          )}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl" style={{ width: boxW, height: boxH, opacity: state === 'ok' ? 1 : 0, transition: 'opacity .25s' }}>
        <iframe
          key={`${post.shortcode}:${attempt}:${captioned}`}
          ref={frame}
          onLoad={() => loadHandler.current()}
          src={embedUrl(post.shortcode, post.kind, captioned)}
          title={`Instagram ${post.kind} by ${post.author ?? 'unknown'}`}
          width={width}
          height={naturalHeight}
          scrolling="no"
          allow="autoplay; encrypted-media; picture-in-picture; clipboard-write; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="block origin-top-left border-0 bg-white"
          style={{ width, height: naturalHeight, transform: scale < 1 ? `scale(${scale})` : undefined }}
        />
      </div>
    </div>
  )
}

export function Skeleton() {
  return (
    <div className="flex h-full animate-pulse flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-full bg-ink-800" />
        <div className="h-3 w-32 rounded-full bg-ink-800" />
      </div>
      <div className="flex-1 rounded-xl bg-ink-800/70" />
      <div className="h-3 w-2/3 rounded-full bg-ink-800" />
      <div className="h-3 w-1/3 rounded-full bg-ink-800" />
    </div>
  )
}

function Notice({ title, body, url, children }: { title: string; body: string; url: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-ink-800 text-ink-400">
        <IconFlag />
      </div>
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-ink-400">{body}</p>
      <div className="mt-1 flex gap-2">
        {children}
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold text-ink-300 hover:bg-ink-800">
          Open <IconExternal size={16} />
        </a>
      </div>
    </div>
  )
}
