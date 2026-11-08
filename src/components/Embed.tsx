import { useEffect, useRef, useState, type ReactNode } from 'react'
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

interface Measure {
  /** Height Instagram reported for the whole embed. */
  height: number
  /** The iframe's width when it reported that. */
  width: number
}

/**
 * Loads one embed and tracks it: loading → ok / unavailable / error, plus the
 * heights Instagram reports. `widthRef` holds the iframe's current width so
 * each height can be paired with the width it was measured at.
 */
function useEmbed(post: Post, captioned: boolean, attempt: number, widthRef: React.RefObject<number>, onState?: (s: EmbedState) => void) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [state, setState] = useState<EmbedState>('loading')
  const [measure, setMeasure] = useState<Measure | null>(null)
  const mounted = useRef(false)
  const onStateRef = useRef(onState)
  onStateRef.current = onState
  const loadHandler = useRef<() => void>(() => {})

  useEffect(() => {
    mounted.current = false
    setState('loading')
    setMeasure(null)
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
        setMeasure({ height: msg.details.height, width: widthRef.current })
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
  }, [post.shortcode, attempt, captioned, widthRef])

  return { frame, state, measure, onLoad: () => loadHandler.current() }
}

/** The whole embed, header and footer included, scaled down to fit. */
export function Embed({ post, maxWidth, maxHeight, captioned = false, onState }: EmbedProps) {
  const [attempt, setAttempt] = useState(0)
  const width = Math.round(Math.min(IG_MAX_WIDTH, Math.max(IG_MIN_WIDTH, maxWidth)))
  const widthRef = useRef(width)
  widthRef.current = width
  const { frame, state, measure, onLoad } = useEmbed(post, captioned, attempt, widthRef, onState)

  // Rough guess until Instagram tells us the real height.
  const naturalHeight = measure?.height ?? Math.round(width * 1.25 + (captioned ? 260 : 180))
  const scale = Math.min(1, maxWidth / width, maxHeight / naturalHeight)

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
          onLoad={onLoad}
          src={embedUrl(post.shortcode, post.kind, captioned)}
          data-code={post.shortcode}
          data-kind={post.kind}
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

// ---------- framed embed ----------
//
// Measured in Chrome (Nov 2026) at 330, 390 and 1710px wide: an uncaptioned
// embed is always a 54px header, the media, then 154px of buttons, likes and
// the comment box, at every width. Reels sit in a 4:5 box with the 9:16 video
// fitted inside it (black bars left and right). Tapping the video plays it in
// place. If Instagram changes these, update the numbers here.
const IG_HEADER = 54
const IG_FOOTER = 154
/** Reels' media box: height ÷ width. */
const REEL_BOX = 5 / 4
/** A reel's video: width ÷ height. */
const REEL_VIDEO = 9 / 16
/** Common post shapes (width ÷ height). A measurement within 3% snaps to one. */
const SHAPES = [1.91, 16 / 9, 4 / 3, 1, 4 / 5, 3 / 4, 9 / 16]

type Shape = { kind: 'reel' } | { kind: 'photo'; aspect: number } | { kind: 'unknown' }

/** Shapes already measured this session, so revisiting a post doesn't jump. */
const shapes = new Map<string, Shape>()

function shapeFrom(m: Measure): Shape {
  const mediaH = m.height - IG_HEADER - IG_FOOTER
  if (mediaH <= 0 || m.width <= 0) return { kind: 'unknown' }
  if (Math.abs(mediaH / m.width - REEL_BOX) < 0.02) return { kind: 'reel' }
  const raw = m.width / mediaH
  // Anything outside this range means the layout isn't what we measured.
  if (raw < 0.45 || raw > 2.2) return { kind: 'unknown' }
  const near = SHAPES.find((a) => Math.abs(raw / a - 1) < 0.03)
  return { kind: 'photo', aspect: near ?? raw }
}

interface FramedEmbedProps {
  post: Post
  /** Space available. The media is sized to fill as much of it as its shape allows. */
  maxWidth: number
  maxHeight: number
  onState?: (state: EmbedState) => void
  /** Drawn on top of the media, e.g. the account name and buttons. */
  overlay?: ReactNode
}

/**
 * Instagram's embed cropped to just the photo or video, so it reads like
 * Instagram's own feed. Reels fill a 9:16 frame; photos use their own shape,
 * worked out from the height Instagram reports.
 *
 * The iframe is resized rather than zoomed, so it stays sharp. It's only
 * scaled when the frame would be narrower than Instagram's minimum width.
 */
export function FramedEmbed({ post, maxWidth, maxHeight, onState, overlay }: FramedEmbedProps) {
  const [attempt, setAttempt] = useState(0)
  const widthRef = useRef(0)
  const { frame, state, measure, onLoad } = useEmbed(post, false, attempt, widthRef, onState)

  // Measure once per post, from the first height Instagram reports.
  let shape = shapes.get(post.shortcode)
  if (!shape && measure) {
    shape = shapeFrom(measure)
    if (shape.kind !== 'unknown') shapes.set(post.shortcode, shape)
  }
  // Until measured: reels are always the same; guess 4:5 for photos.
  const s: Shape = shape ?? (post.kind === 'post' ? { kind: 'photo', aspect: 4 / 5 } : { kind: 'reel' })

  if (s.kind === 'unknown') {
    // The layout doesn't match what we measured; show the whole embed instead.
    return <Embed post={post} maxWidth={maxWidth} maxHeight={maxHeight} onState={onState} />
  }

  // Size of the visible frame, and how wide the iframe must be to fill it.
  let boxW: number, boxH: number, idealW: number, mediaRatio: number
  if (s.kind === 'reel') {
    boxH = Math.min(maxHeight, maxWidth / REEL_VIDEO)
    boxW = boxH * REEL_VIDEO
    idealW = boxH / REEL_BOX
    mediaRatio = REEL_BOX
  } else {
    boxW = Math.min(maxWidth, maxHeight * s.aspect)
    boxH = boxW / s.aspect
    idealW = boxW
    mediaRatio = 1 / s.aspect
  }
  const frameW = Math.max(IG_MIN_WIDTH, Math.round(idealW))
  // Only scale when Instagram's minimum width forces it, not for rounding.
  const scale = frameW > Math.round(idealW) ? idealW / frameW : 1
  const frameH = Math.round(IG_HEADER + frameW * mediaRatio + IG_FOOTER)
  widthRef.current = frameW

  boxW = Math.round(boxW)
  boxH = Math.round(boxH)
  const left = Math.round((boxW - idealW) / 2)
  const top = -Math.round(IG_HEADER * scale)

  return (
    <div className="relative overflow-hidden rounded-2xl bg-black" style={{ width: boxW, height: boxH }}>
      <iframe
        key={`${post.shortcode}:${attempt}`}
        ref={frame}
        onLoad={onLoad}
        src={embedUrl(post.shortcode, post.kind, false)}
        data-code={post.shortcode}
        data-kind={post.kind}
        title={`Instagram ${post.kind} by ${post.author ?? 'unknown'}`}
        width={frameW}
        height={frameH}
        scrolling="no"
        allow="autoplay; encrypted-media; picture-in-picture; clipboard-write; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="absolute block origin-top-left border-0"
        style={{
          left,
          top,
          width: frameW,
          height: frameH,
          transform: scale < 1 ? `scale(${scale})` : undefined,
          opacity: state === 'ok' ? 1 : 0,
          transition: 'opacity .25s',
        }}
      />
      {state === 'ok' && overlay}
      {state !== 'ok' && (
        <div className="absolute inset-0 border border-ink-800 bg-ink-900">
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
      <p className="font-medium">{title}</p>
      <p className="text-sm text-ink-400">{body}</p>
      <div className="mt-1 flex gap-2">
        {children}
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-[10px] px-4 text-sm font-medium text-ink-300 transition-colors hover:bg-ink-800">
          Open <IconExternal size={16} />
        </a>
      </div>
    </div>
  )
}
