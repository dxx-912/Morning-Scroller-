import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BackgroundChecker } from '../components/BackgroundChecker'
import { CategoryAssignSheet } from '../components/CategoryAssign'
import { FramedEmbed, type EmbedState } from '../components/Embed'
import { Media } from '../components/Media'
import { IconChevronDown, IconChevronUp, IconExternal, IconFlag, IconPlay, IconShuffle, IconTag } from '../components/icons'
import { Button } from '../components/Sheet'
import { useToast } from '../components/Toast'
import { needsCheck } from '../lib/check'
import { ALL, UNCATEGORIZED, buildFeed } from '../lib/feed'
import { useElementSize } from '../lib/hooks'
import { getVideo, VIDEO_LOOKUPS } from '../lib/video'
import type { Category, Post } from '../lib/types'
import { categoryColor, formatDate, plural } from '../lib/util'
import { useLibrary } from '../state/LibraryContext'
import { navigate } from '../state/router'
import { useOnboarding } from '../state/onboarding'
import { useSettings } from '../state/settings'

const HEADER_H = 52
const ACTIONS_H = 64
/** Mount the current embed plus this many neighbors on each side. */
const WINDOW = 1
/** A tap on a reel followed by the app leaving this soon after means the reel opened Instagram. */
const TAP_TO_LEAVE_MS = 2000
/** Check this many posts ahead of you in the background for deleted ones. */
const CHECK_AHEAD = 30
/** Look up video links this many posts ahead so they're ready when you get there. */
const PREFETCH_AHEAD = 3

const SETUP_MESSAGES: Record<string, string> = {
  'no-login': 'Videos need an Instagram login file. Showing embeds for now.',
  'login-expired': 'Instagram login expired. Re-export it to get videos back.',
  'no-ytdlp': 'yt-dlp isn\'t installed. Showing embeds for now.',
}

export function categoryLabel(id: string, categories: Category[]): string {
  if (id === ALL) return 'All saved'
  if (id === UNCATEGORIZED) return 'Uncategorized'
  return categories.find((c) => c.id === id)?.name ?? 'Category'
}

export function Feed({ categoryId }: { categoryId: string }) {
  const { posts, byCode, categories, today, resumeAt, savePosition, setStatus, recordCheck, chooseCategory } = useLibrary()
  const [{ captions }] = useSettings()
  const { feedTipSeen, dismissFeedTip } = useOnboarding()
  const toast = useToast()

  // The session's order is fixed when the feed opens (seeded by day + category).
  // Posts that die *ahead* of you are dropped; ones behind you stay so nothing jumps.
  const [order, setOrder] = useState(() => buildFeed(posts, categoryId, today).map((p) => p.shortcode))
  const [current, setCurrent] = useState(() => Math.max(0, order.indexOf(resumeAt ?? '')))
  const currentRef = useRef(current)
  currentRef.current = current
  const [tagging, setTagging] = useState<string | null>(null)
  // Start muted: browsers only autoplay silent video until you tap.
  const [muted, setMuted] = useState(true)
  const warnedSetup = useRef(false)
  const onSetupIssue = useCallback(
    (reason: string) => {
      // Setup problems are the site owner's to fix (the deployed site alerts
      // them), so visitors just get embeds without a message.
      if (warnedSetup.current || !import.meta.env.DEV) return
      warnedSetup.current = true
      toast(SETUP_MESSAGES[reason] ?? 'Videos unavailable. Showing embeds.')
    },
    [toast],
  )

  const scroller = useRef<HTMLDivElement>(null)
  const { width, height } = useElementSize(scroller)

  // Jump to where you left off, once we know the item height.
  const restored = useRef(false)
  useLayoutEffect(() => {
    if (restored.current || !height || !scroller.current) return
    restored.current = true
    scroller.current.scrollTop = current * height
  }, [height, current])

  const onScroll = useCallback(() => {
    const el = scroller.current
    if (!el || !el.clientHeight) return
    const i = Math.round(el.scrollTop / el.clientHeight)
    if (i !== currentRef.current) setCurrent(i)
  }, [])

  useEffect(() => {
    const code = order[current]
    if (code) savePosition(code)
  }, [current, order, savePosition])

  useEffect(() => {
    if (!VIDEO_LOOKUPS) return
    for (const code of order.slice(current + 1, current + 1 + PREFETCH_AHEAD)) void getVideo(code)
  }, [current, order])

  const go = useCallback(
    (i: number) => {
      const el = scroller.current
      if (!el) return
      const max = order.length // the end card sits at index order.length
      el.scrollTo({ top: Math.max(0, Math.min(max, i)) * el.clientHeight, behavior: 'smooth' })
    },
    [order.length],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tagging || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as HTMLElement)?.closest('input, textarea, [role=dialog]')) return
      if (['ArrowDown', 'PageDown', 'j', ' '].includes(e.key)) {
        e.preventDefault()
        go(currentRef.current + 1)
      } else if (['ArrowUp', 'PageUp', 'k'].includes(e.key)) {
        e.preventDefault()
        go(currentRef.current - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, tagging])

  const handleEmbedState = useCallback(
    (code: string, index: number, s: EmbedState) => {
      if (s === 'ok') setStatus(code, 'ok')
      if (s !== 'unavailable') return
      setStatus(code, 'unavailable')
      if (index > currentRef.current) {
        setOrder((o) => o.filter((c) => c !== code))
      } else if (index === currentRef.current) {
        toast('Unavailable post, skipping ahead')
        setTimeout(() => {
          if (currentRef.current === index) go(index + 1)
        }, 1600)
      }
    },
    [setStatus, toast, go],
  )

  // Some reels won't play in the embed: tapping them opens Instagram instead
  // (often reels with licensed music). The app can't see inside the embed,
  // but it can see what happens next: a tap on a reel, then the app going to
  // the background. That reel gets marked and skipped from then on.
  // Saving the mark updates the library, which hands this screen new
  // callbacks. Read them through refs so the listeners below (and what they
  // remember) live for the whole visit instead of restarting.
  const orderRef = useRef(order)
  orderRef.current = order
  const latest = useRef({ setStatus, toast, go })
  latest.current = { setStatus, toast, go }
  useEffect(() => {
    let tapped: { code: string; at: number } | null = null
    let leftFor: string | null = null

    const markWatchOnly = (code: string) => latest.current.setStatus(code, 'unavailable', 'watch-only')

    // Tapping inside an embed moves focus into its iframe. The window's blur
    // event isn't always fired for that, so also watch for focus changing.
    // Photos open Instagram when tapped anyway, so only reels count.
    // Start from whatever already has focus, so an old tap doesn't count as new.
    let focused: Element | null = document.activeElement
    const checkFocus = () => {
      const el = document.activeElement
      if (el === focused) return
      focused = el
      if (el instanceof HTMLIFrameElement && el.dataset.code && el.dataset.kind !== 'post') {
        tapped = { code: el.dataset.code, at: Date.now() }
      }
    }
    const onBlur = () => setTimeout(checkFocus, 0)
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') checkFocus()
    }, 250)

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        checkFocus()
        if (tapped && Date.now() - tapped.at < TAP_TO_LEAVE_MS) {
          leftFor = tapped.code
          // Save now too, in case the app is closed while in Instagram.
          void markWatchOnly(leftFor)
        }
        tapped = null
        return
      }
      if (!leftFor) return
      const code = leftFor
      leftFor = null
      void markWatchOnly(code)
      const { toast, setStatus, go } = latest.current
      toast('That reel only plays on Instagram, so it’s off your feed now', { label: 'Undo', run: () => setStatus(code, 'unknown') })
      const i = orderRef.current.indexOf(code)
      if (i === currentRef.current) go(i + 1)
    }

    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(poll)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // Check posts ahead of you in the background, so deleted ones drop out
  // before you reach them. The current post and its neighbors are already
  // loading in the feed itself.
  const checkCandidates = useMemo(() => {
    const now = Date.now()
    return order
      .slice(current + WINDOW + 1, current + WINDOW + 1 + CHECK_AHEAD)
      .map((code) => byCode.get(code))
      .filter((p): p is Post => !!p && needsCheck(p, now))
  }, [order, current, byCode])

  const onChecked = useCallback(
    async (code: string, ok: boolean) => {
      const status = await recordCheck(code, ok)
      if (status !== 'unavailable') return
      // Drop it if it's still ahead of you; never yank the post you're on.
      setOrder((o) => {
        const i = o.indexOf(code)
        return i > currentRef.current ? o.filter((c) => c !== code) : o
      })
    },
    [recordCheck],
  )

  const flag = (code: string) => {
    setStatus(code, 'unavailable')
    toast('Marked as unavailable', { label: 'Undo', run: () => setStatus(code, 'unknown') })
    go(current + 1)
  }

  const label = categoryLabel(categoryId, categories)
  const embedW = Math.max(0, width - 24)
  // Framed posts carry their buttons on top, so they get the action bar's space too.
  const framed = !captions && !VIDEO_LOOKUPS
  const embedH = Math.max(0, height - HEADER_H - (framed ? 0 : ACTIONS_H) - 12)

  return (
    <div className="relative h-full min-h-0 flex-1">
      {/* Header */}
      <div className="pt-safe pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-ink-950 via-ink-950/80 to-transparent">
        <div className="pointer-events-auto mx-auto flex max-w-xl items-center justify-between px-4" style={{ height: HEADER_H }}>
          <button
            onClick={() => chooseCategory(null)}
            className="flex max-w-[65%] items-center gap-1.5 rounded-full border border-ink-100/12 bg-ink-900 py-1.5 pr-2.5 pl-3.5 text-sm font-medium transition-colors hover:bg-ink-800"
            aria-label={`Today's category: ${label}. Change`}
          >
            <span className="truncate">{label}</span>
            <IconChevronDown size={16} className="shrink-0 text-ink-400" />
          </button>
          {order.length > 0 && (
            <span className="font-mono text-xs text-ink-400 tabular-nums" aria-live="polite">
              {Math.min(current + 1, order.length)} of {order.length}
            </span>
          )}
        </div>
        {/* The folio's progress: how far into today's edition you are. */}
        {order.length > 0 && (
          <div className="mx-auto h-px max-w-xl px-4" aria-hidden>
            <div className="h-full bg-ink-100/8">
              <div className="h-full origin-left bg-sun-400 transition-transform duration-300" style={{ transform: `scaleX(${Math.min(current + 1, order.length) / order.length})` }} />
            </div>
          </div>
        )}
      </div>

      {order.length === 0 ? (
        <EmptyFeed label={label} onPick={() => chooseCategory(null)} />
      ) : (
        <div
          ref={scroller}
          onScroll={onScroll}
          className="no-scrollbar h-full snap-y snap-mandatory overflow-y-scroll overscroll-y-contain"
          aria-label="Feed"
        >
          {order.map((code, i) => {
            const post = byCode.get(code)
            const near = Math.abs(i - current) <= WINDOW
            return (
              <section
                key={code}
                className="flex h-full snap-start snap-always flex-col items-center justify-center px-3"
                style={{ paddingTop: HEADER_H }}
                aria-label={`Post ${i + 1} of ${order.length}`}
              >
                {post && near && embedW > 0 ? (
                  <FeedItem
                    post={post}
                    categories={categories}
                    maxWidth={embedW}
                    maxHeight={embedH}
                    captioned={captions}
                    framed={framed}
                    active={i === current}
                    muted={muted}
                    onMutedChange={setMuted}
                    onSetupIssue={onSetupIssue}
                    onState={(s) => handleEmbedState(code, i, s)}
                    onTag={() => setTagging(code)}
                    onFlag={() => flag(code)}
                  />
                ) : (
                  <div className="size-0" />
                )}
              </section>
            )
          })}
          <EndCard count={order.length} label={label} onTop={() => go(0)} onPick={() => chooseCategory(null)} />
        </div>
      )}

      {/* Desktop up/down controls */}
      {order.length > 0 && (
        <div className="absolute top-1/2 right-5 z-20 hidden -translate-y-1/2 flex-col gap-2 md:flex">
          <RoundButton label="Previous" onClick={() => go(current - 1)} disabled={current === 0}>
            <IconChevronUp />
          </RoundButton>
          <RoundButton label="Next" onClick={() => go(current + 1)} disabled={current >= order.length}>
            <IconChevronDown />
          </RoundButton>
        </div>
      )}

      <CategoryAssignSheet codes={tagging ? [tagging] : []} open={!!tagging} onClose={() => setTagging(null)} />
      <BackgroundChecker candidates={checkCandidates} onResult={onChecked} />
      {!feedTipSeen && order.length > 0 && <FeedTip onDismiss={dismissFeedTip} />}
    </div>
  )
}

interface FeedItemProps {
  post: Post
  categories: Category[]
  maxWidth: number
  maxHeight: number
  captioned: boolean
  /** Crop the embed to just the media, with the details drawn on top. */
  framed: boolean
  active: boolean
  muted: boolean
  onMutedChange: (muted: boolean) => void
  onSetupIssue: (reason: string) => void
  onState: (s: EmbedState) => void
  onTag: () => void
  onFlag: () => void
}

function FeedItem({ post, categories, maxWidth, maxHeight, captioned, framed, active, muted, onMutedChange, onSetupIssue, onState, onTag, onFlag }: FeedItemProps) {
  const cats = categories.filter((c) => post.categoryIds.includes(c.id))

  if (framed) {
    return (
      <FramedEmbed
        post={post}
        maxWidth={maxWidth}
        maxHeight={maxHeight}
        onState={onState}
        overlay={<FramedOverlay post={post} cats={cats} onTag={onTag} onFlag={onFlag} />}
      />
    )
  }

  // The wrapper shrinks to the (scaled) embed, so the action bar lines up with it.
  return (
    <div className="flex w-fit max-w-full flex-col" style={{ minWidth: Math.min(maxWidth, 300) }}>
      <div className="flex items-center justify-center" style={{ maxHeight }}>
        <Media
          post={post}
          maxWidth={maxWidth}
          maxHeight={maxHeight}
          captioned={captioned}
          active={active}
          muted={muted}
          onMutedChange={onMutedChange}
          onSetupIssue={onSetupIssue}
          onState={onState}
        />
      </div>
      <div className="flex shrink-0 items-center gap-3 px-1" style={{ height: ACTIONS_H }}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{post.author ? `@${post.author}` : post.kind === 'reel' ? 'Reel' : 'Post'}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-ink-400">
            {cats.length > 0 ? (
              cats.slice(0, 3).map((c) => (
                <span key={c.id} className="inline-flex items-center gap-1">
                  <span className="size-1.5 rounded-full" style={{ background: categoryColor(c.hue) }} />
                  {c.name}
                </span>
              ))
            ) : (
              <span>Saved {formatDate(post.savedAt)}</span>
            )}
            {cats.length > 3 && <span>+{cats.length - 3}</span>}
          </p>
        </div>
        <ActionButton label="Categories" onClick={onTag}>
          <IconTag />
        </ActionButton>
        <a href={post.url} target="_blank" rel="noreferrer" aria-label="Open in Instagram" className="grid size-10 place-items-center rounded-full text-ink-300 transition-colors hover:bg-ink-800 hover:text-ink-100">
          <IconExternal />
        </a>
        <ActionButton label="Mark unavailable" onClick={onFlag}>
          <IconFlag />
        </ActionButton>
      </div>
    </div>
  )
}

/**
 * Account, categories and buttons along the bottom of a framed post, like
 * Instagram's own feed. Only the buttons take taps; the rest passes through
 * to the embed, so tapping anywhere on a reel still plays it.
 */
function FramedOverlay({ post, cats, onTag, onFlag }: { post: Post; cats: Category[]; onTag: () => void; onFlag: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-2 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-3 pt-12 pb-3 text-white">
      <div className="min-w-0 flex-1 pb-1 [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]">
        <p className="truncate text-[15px] font-medium">{post.author ? `@${post.author}` : post.kind === 'post' ? 'Post' : 'Reel'}</p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-white/80">
          {cats.length > 0 ? (
            cats.slice(0, 3).map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full" style={{ background: categoryColor(c.hue) }} />
                {c.name}
              </span>
            ))
          ) : (
            <span>Saved {formatDate(post.savedAt)}</span>
          )}
          {cats.length > 3 && <span>+{cats.length - 3}</span>}
        </p>
      </div>
      <div className="pointer-events-auto flex shrink-0 items-center">
        <OverlayButton label="Categories" onClick={onTag}>
          <IconTag />
        </OverlayButton>
        <a href={post.url} target="_blank" rel="noreferrer" aria-label="Open in Instagram" title="Open in Instagram" className="grid size-10 place-items-center rounded-full text-white/90 transition-[background-color,transform] hover:bg-white/15 active:scale-95">
          <IconExternal />
        </a>
        <OverlayButton label="Mark unavailable" onClick={onFlag}>
          <IconFlag />
        </OverlayButton>
      </div>
    </div>
  )
}

function OverlayButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="grid size-10 place-items-center rounded-full text-white/90 transition-[background-color,transform] hover:bg-white/15 active:scale-95">
      {children}
    </button>
  )
}

/** Shown on the first visit to the feed only (once per browser). */
function FeedTip({ onDismiss }: { onDismiss: () => void }) {
  const tips = [
    { icon: <IconChevronUp size={18} />, text: 'Swipe up for the next post' },
    { icon: <IconPlay size={18} />, text: 'Tap a reel to play it' },
    { icon: <IconTag size={18} />, text: 'Tag it into categories' },
    { icon: <IconFlag size={18} />, text: 'Flag one that won’t load' },
  ]
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-sm animate-rise rounded-2xl border border-ink-100/8 bg-ink-850 p-4 shadow-[0_8px_32px_rgba(0,0,0,0.45)]" role="dialog" aria-label="How the feed works">
        <ul className="grid grid-cols-2 gap-x-3 gap-y-3">
          {tips.map((t) => (
            <li key={t.text} className="flex items-center gap-2 text-[13px] leading-snug text-ink-300">
              <span className="shrink-0 text-ink-400">{t.icon}</span>
              {t.text}
            </li>
          ))}
        </ul>
        <Button variant="primary" size="sm" className="mt-4 w-full" onClick={onDismiss}>
          Got it
        </Button>
      </div>
    </div>
  )
}

function ActionButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="grid size-10 place-items-center rounded-full text-ink-300 transition-[background-color,color,transform] hover:bg-ink-800 hover:text-ink-100 active:scale-95">
      {children}
    </button>
  )
}

function RoundButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label} className="grid size-11 place-items-center rounded-full border border-ink-100/8 bg-ink-900 text-ink-300 transition-colors hover:bg-ink-800 hover:text-ink-100 disabled:opacity-30">
      {children}
    </button>
  )
}

function EndCard({ count, label, onTop, onPick }: { count: number; label: string; onTop: () => void; onPick: () => void }) {
  return (
    <section className="flex h-full snap-start flex-col items-center justify-center px-8 text-center" style={{ paddingTop: HEADER_H }}>
      <p className="flex items-center gap-2 font-mono text-xs text-ink-500 tabular-nums">
        <IconShuffle size={14} />
        {count} of {count}
      </p>
      <h2 className="font-display mt-3 text-[36px] leading-tight">That's all for today</h2>
      <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-ink-400">
        You've seen {plural(count, 'post')} in <span className="text-ink-100">{label}</span>. Tomorrow brings a fresh shuffle.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        <Button variant="primary" onClick={onPick}>
          Pick another category
        </Button>
        <Button variant="ghost" onClick={onTop}>
          Back to top
        </Button>
      </div>
    </section>
  )
}

function EmptyFeed({ label, onPick }: { label: string; onPick: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <h2 className="font-display text-[28px] leading-tight">Nothing to show in {label}</h2>
      <p className="max-w-xs text-sm text-ink-400">Add posts to this category from the Library, or pick a different one.</p>
      <div className="mt-2 flex gap-2">
        <Button variant="primary" onClick={onPick}>
          Pick a category
        </Button>
        <Button variant="ghost" onClick={() => navigate('library')}>
          Open Library
        </Button>
      </div>
    </div>
  )
}
