import { useEffect, useRef, useState } from 'react'
import { getVideo, type VideoSource } from '../lib/video'
import type { Post } from '../lib/types'
import { Embed, Skeleton, type EmbedState } from './Embed'
import { IconMuted, IconPlay, IconVolume } from './icons'

/**
 * One feed item's media: the app's own autoplaying video player when the local
 * video server can supply the file, otherwise Instagram's embed.
 */

interface MediaProps {
  post: Post
  maxWidth: number
  maxHeight: number
  captioned: boolean
  /** True for the item currently on screen. Only that one plays. */
  active: boolean
  muted: boolean
  onMutedChange: (muted: boolean) => void
  onState: (s: EmbedState) => void
  /** The video server is set up wrong (no login, login expired, no yt-dlp). */
  onSetupIssue?: (reason: string) => void
}

const SETUP_ISSUES = new Set(['no-login', 'login-expired', 'no-ytdlp'])

export function Media({ post, maxWidth, maxHeight, captioned, active, muted, onMutedChange, onState, onSetupIssue }: MediaProps) {
  const [source, setSource] = useState<VideoSource | null>(null)
  const [retried, setRetried] = useState(false)
  const setupRef = useRef(onSetupIssue)
  setupRef.current = onSetupIssue

  useEffect(() => {
    let live = true
    setSource(null)
    getVideo(post.shortcode, retried).then((s) => {
      if (!live) return
      if (s.type === 'embed' && SETUP_ISSUES.has(s.reason)) setupRef.current?.(s.reason)
      setSource(s)
    })
    return () => {
      live = false
    }
  }, [post.shortcode, retried])

  if (!source) {
    const w = Math.min(maxWidth, 400)
    return (
      <div className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-900" style={{ width: w, height: Math.min(maxHeight, w * 1.6) }}>
        <Skeleton />
      </div>
    )
  }

  if (source.type === 'embed') {
    return <Embed post={post} maxWidth={maxWidth} maxHeight={maxHeight} captioned={captioned} onState={onState} />
  }

  return (
    <VideoPlayer
      source={source}
      maxWidth={maxWidth}
      maxHeight={maxHeight}
      active={active}
      muted={muted}
      onMutedChange={onMutedChange}
      onReady={() => onState('ok')}
      onFail={() => {
        // The CDN link may have expired: ask for a fresh one once, then give up and embed.
        if (!retried) setRetried(true)
        else setSource({ type: 'embed', reason: 'failed' })
      }}
      label={`Video by ${post.author ?? 'unknown'}`}
    />
  )
}

interface PlayerProps {
  source: Extract<VideoSource, { type: 'video' }>
  maxWidth: number
  maxHeight: number
  active: boolean
  muted: boolean
  onMutedChange: (muted: boolean) => void
  onReady: () => void
  onFail: () => void
  label: string
}

function VideoPlayer({ source, maxWidth, maxHeight, active, muted, onMutedChange, onReady, onFail, label }: PlayerProps) {
  const video = useRef<HTMLVideoElement>(null)
  const [paused, setPaused] = useState(false) // paused by a tap, not by scrolling away
  const [progress, setProgress] = useState(0)

  const aspect = source.width && source.height ? source.width / source.height : 9 / 16
  const w = Math.round(Math.min(maxWidth, maxHeight * aspect))
  const h = Math.round(w / aspect)

  // Play when this item is on screen, stop and rewind when it isn't.
  useEffect(() => {
    const v = video.current
    if (!v) return
    if (!active) {
      v.pause()
      v.currentTime = 0
      setPaused(false)
      return
    }
    if (paused) return
    v.muted = muted
    v.play().catch((err: DOMException) => {
      // Browsers block autoplay with sound until you've tapped. Fall back to muted.
      if (err.name === 'NotAllowedError' && !v.muted) {
        onMutedChange(true)
        v.muted = true
        v.play().catch(() => {})
      }
    })
  }, [active, paused, muted, onMutedChange])

  const togglePause = () => {
    const v = video.current
    if (!v) return
    if (v.paused) {
      setPaused(false)
      v.play().catch(() => {})
    } else {
      setPaused(true)
      v.pause()
    }
  }

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    const v = video.current
    const next = !muted
    // Set it inside the tap so the browser counts it as allowed.
    if (v) {
      v.muted = next
      if (!next && active && !paused) v.play().catch(() => {})
    }
    onMutedChange(next)
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-black" style={{ width: w, height: h }}>
      <video
        ref={video}
        src={source.url}
        poster={source.poster}
        aria-label={label}
        className="block size-full object-contain"
        playsInline
        loop
        muted={muted}
        preload="auto"
        onClick={togglePause}
        onLoadedData={onReady}
        onError={onFail}
        onTimeUpdate={(e) => {
          const v = e.currentTarget
          if (v.duration) setProgress(v.currentTime / v.duration)
        }}
      />

      {paused && (
        <button onClick={togglePause} aria-label="Play" className="absolute inset-0 grid place-items-center bg-black/25">
          <span className="grid size-16 place-items-center rounded-full bg-black/50 text-white backdrop-blur">
            <IconPlay size={30} />
          </span>
        </button>
      )}

      <button
        onClick={toggleMute}
        aria-label={muted ? 'Turn sound on' : 'Mute'}
        className="absolute right-3 bottom-4 flex h-9 items-center gap-1.5 rounded-full bg-black/55 px-3 text-sm font-semibold text-white backdrop-blur transition active:scale-95"
      >
        {muted ? <IconMuted size={18} /> : <IconVolume size={18} />}
        {muted && <span>Tap for sound</span>}
      </button>

      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/15">
        <div className="h-full bg-white/80" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  )
}
