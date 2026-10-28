import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CategoryAssignSheet } from '../components/CategoryAssign'
import { Embed, type EmbedState } from '../components/Embed'
import { IconChevronDown, IconChevronUp, IconExternal, IconFlag, IconShuffle, IconTag } from '../components/icons'
import { Button } from '../components/Sheet'
import { useToast } from '../components/Toast'
import { ALL, UNCATEGORIZED, buildFeed } from '../lib/feed'
import { useElementSize } from '../lib/hooks'
import type { Category, Post } from '../lib/types'
import { formatDate, plural } from '../lib/util'
import { useLibrary } from '../state/LibraryContext'
import { navigate } from '../state/router'
import { useSettings } from '../state/settings'

const HEADER_H = 52
const ACTIONS_H = 64
/** Mount the current embed plus this many neighbors on each side. */
const WINDOW = 1

export function categoryLabel(id: string, categories: Category[]): string {
  if (id === ALL) return 'All saved'
  if (id === UNCATEGORIZED) return 'Uncategorized'
  return categories.find((c) => c.id === id)?.name ?? 'Category'
}

export function Feed({ categoryId }: { categoryId: string }) {
  const { posts, byCode, categories, today, resumeAt, savePosition, setStatus, chooseCategory } = useLibrary()
  const [{ captions }] = useSettings()
  const toast = useToast()

  // The session's order is fixed when the feed opens (seeded by day + category).
  // Posts that die *ahead* of you are dropped; ones behind you stay so nothing jumps.
  const [order, setOrder] = useState(() => buildFeed(posts, categoryId, today).map((p) => p.shortcode))
  const [current, setCurrent] = useState(() => Math.max(0, order.indexOf(resumeAt ?? '')))
  const currentRef = useRef(current)
  currentRef.current = current
  const [tagging, setTagging] = useState<string | null>(null)

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

  const flag = (code: string) => {
    setStatus(code, 'unavailable')
    toast('Marked as unavailable', { label: 'Undo', run: () => setStatus(code, 'unknown') })
    go(current + 1)
  }

  const label = categoryLabel(categoryId, categories)
  const embedW = Math.max(0, width - 24)
  const embedH = Math.max(0, height - HEADER_H - ACTIONS_H - 12)

  return (
    <div className="relative h-full min-h-0 flex-1">
      {/* Header */}
      <div className="pt-safe pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-ink-950 via-ink-950/80 to-transparent">
        <div className="pointer-events-auto mx-auto flex max-w-xl items-center justify-between px-4" style={{ height: HEADER_H }}>
          <button
            onClick={() => chooseCategory(null)}
            className="flex max-w-[65%] items-center gap-1.5 rounded-full border border-ink-700 bg-ink-900/80 py-1.5 pr-2.5 pl-3.5 text-sm font-semibold backdrop-blur hover:border-ink-600"
            aria-label={`Today's category: ${label}. Change`}
          >
            <span className="truncate">{label}</span>
            <IconChevronDown size={16} className="shrink-0 text-ink-400" />
          </button>
          {order.length > 0 && (
            <span className="text-xs font-medium text-ink-400 tabular-nums" aria-live="polite">
              {Math.min(current + 1, order.length)} / {order.length}
            </span>
          )}
        </div>
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
    </div>
  )
}

interface FeedItemProps {
  post: Post
  categories: Category[]
  maxWidth: number
  maxHeight: number
  captioned: boolean
  onState: (s: EmbedState) => void
  onTag: () => void
  onFlag: () => void
}

function FeedItem({ post, categories, maxWidth, maxHeight, captioned, onState, onTag, onFlag }: FeedItemProps) {
  const cats = categories.filter((c) => post.categoryIds.includes(c.id))
  // The wrapper shrinks to the (scaled) embed, so the action bar lines up with it.
  return (
    <div className="flex w-fit max-w-full flex-col" style={{ minWidth: Math.min(maxWidth, 300) }}>
      <div className="flex items-center justify-center" style={{ maxHeight }}>
        <Embed post={post} maxWidth={maxWidth} maxHeight={maxHeight} captioned={captioned} onState={onState} />
      </div>
      <div className="flex shrink-0 items-center gap-3 px-1" style={{ height: ACTIONS_H }}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{post.author ? `@${post.author}` : post.kind === 'reel' ? 'Reel' : 'Post'}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-ink-400">
            {cats.length > 0 ? (
              cats.slice(0, 3).map((c) => (
                <span key={c.id} className="inline-flex items-center gap-1">
                  <span className="size-1.5 rounded-full" style={{ background: `hsl(${c.hue} 85% 65%)` }} />
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
        <a href={post.url} target="_blank" rel="noreferrer" aria-label="Open in Instagram" className="grid size-10 place-items-center rounded-full text-ink-300 hover:bg-ink-800 hover:text-ink-100">
          <IconExternal />
        </a>
        <ActionButton label="Mark unavailable" onClick={onFlag}>
          <IconFlag />
        </ActionButton>
      </div>
    </div>
  )
}

function ActionButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="grid size-10 place-items-center rounded-full text-ink-300 transition hover:bg-ink-800 hover:text-ink-100 active:scale-90">
      {children}
    </button>
  )
}

function RoundButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label} className="grid size-11 place-items-center rounded-full border border-ink-700 bg-ink-900 text-ink-300 hover:text-ink-100 disabled:opacity-30">
      {children}
    </button>
  )
}

function EndCard({ count, label, onTop, onPick }: { count: number; label: string; onTop: () => void; onPick: () => void }) {
  return (
    <section className="flex h-full snap-start flex-col items-center justify-center gap-4 px-8 text-center" style={{ paddingTop: HEADER_H }}>
      <div className="grid size-16 place-items-center rounded-full bg-sunrise text-ink-950">
        <IconShuffle size={28} />
      </div>
      <h2 className="font-display text-2xl font-bold tracking-tight">That's all for today</h2>
      <p className="max-w-xs text-ink-400">
        You've seen {plural(count, 'post')} in <span className="text-ink-100">{label}</span>. Tomorrow brings a fresh shuffle.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
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
      <h2 className="font-display text-xl font-bold">Nothing to show in {label}</h2>
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
