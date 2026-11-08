import { useEffect, useMemo, useState } from 'react'
import { CategoryAssignList, CategoryAssignSheet } from '../components/CategoryAssign'
import { Embed } from '../components/Embed'
import { IconCheck, IconClose, IconExternal, IconFlag, IconPhoto, IconReel, IconRestore, IconSearch, IconSelect, IconTag, IconTrash } from '../components/icons'
import { Button, ConfirmSheet, Sheet } from '../components/Sheet'
import { useToast } from '../components/Toast'
import { ALL, UNCATEGORIZED, inCategory } from '../lib/feed'
import type { Category, Post } from '../lib/types'
import { categoryColor, cx, formatDate, plural } from '../lib/util'
import { useLibrary } from '../state/LibraryContext'
import { useSettings } from '../state/settings'

const PAGE = 120
type KindFilter = 'any' | 'post' | 'reel'
type Sort = 'newest' | 'oldest'

function initialCategory(): string {
  return new URLSearchParams(location.hash.split('?')[1] ?? '').get('c') ?? ALL
}

export function Library() {
  const { posts, categories, deletePosts } = useLibrary()
  const toast = useToast()
  const [cat, setCat] = useState(initialCategory)
  const [kind, setKind] = useState<KindFilter>('any')
  const [sort, setSort] = useState<Sort>('newest')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // A category deleted elsewhere shouldn't leave the filter stuck.
  const validCat = cat === ALL || cat === UNCATEGORIZED || categories.some((c) => c.id === cat) ? cat : ALL

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, '')
    const list = posts.filter(
      (p) =>
        inCategory(p, validCat) &&
        (kind === 'any' || (kind === 'reel' ? p.kind === 'reel' : p.kind !== 'reel')) &&
        (!q || p.author?.toLowerCase().includes(q) || p.shortcode.toLowerCase().includes(q)),
    )
    const dir = sort === 'newest' ? -1 : 1
    return list.sort((a, b) => dir * ((a.savedAt ?? a.addedAt) - (b.savedAt ?? b.addedAt)))
  }, [posts, validCat, kind, query, sort])

  useEffect(() => setLimit(PAGE), [validCat, kind, query, sort])

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of posts) for (const id of p.categoryIds) m.set(id, (m.get(id) ?? 0) + 1)
    return m
  }, [posts])
  const uncategorized = posts.filter((p) => p.categoryIds.length === 0).length

  const toggle = (code: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(code)) n.delete(code)
      else n.add(code)
      return n
    })

  const exitSelect = () => {
    setSelecting(false)
    setSelected(new Set())
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.shortcode))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="pt-safe shrink-0 border-b border-ink-100/8 bg-ink-950">
        <div className="mx-auto max-w-5xl px-4 pt-4">
          <div className="flex items-center justify-between gap-3">
            {selecting ? (
              <>
                <button onClick={exitSelect} className="-ml-2 flex items-center gap-1 rounded-lg p-2 text-ink-300 transition-colors hover:text-ink-100" aria-label="Cancel selection">
                  <IconClose size={20} />
                </button>
                <h1 className="flex-1 text-lg font-medium">{selected.size ? `${selected.size} selected` : 'Select posts'}</h1>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelected(allVisibleSelected ? new Set() : new Set(filtered.map((p) => p.shortcode)))}
                >
                  {allVisibleSelected ? 'Clear' : `Select all ${filtered.length}`}
                </Button>
              </>
            ) : (
              <>
                <h1 className="font-display flex items-baseline gap-2 text-[32px] leading-none">
                  Library <span className="font-mono text-xs text-ink-500 tabular-nums">{posts.length.toLocaleString()}</span>
                </h1>
                <Button size="sm" variant="secondary" onClick={() => setSelecting(true)} disabled={posts.length === 0}>
                  <IconSelect size={17} /> Select
                </Button>
              </>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-ink-100/8 bg-ink-900 px-3 text-ink-500 focus-within:border-sun-500/60">
              <IconSearch size={18} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by account"
                className="min-w-0 flex-1 bg-transparent text-[15px] text-ink-100 placeholder:text-ink-500 focus:outline-none"
                type="search"
              />
            </label>
            <select
              value={`${kind}:${sort}`}
              onChange={(e) => {
                const [k, s] = e.target.value.split(':')
                setKind(k as KindFilter)
                setSort(s as Sort)
              }}
              className="h-10 rounded-[10px] border border-ink-100/8 bg-ink-900 px-3 text-sm text-ink-300 focus:border-sun-500/60 focus:outline-none"
              aria-label="Type and sort"
            >
              <option value="any:newest">All · newest</option>
              <option value="any:oldest">All · oldest</option>
              <option value="post:newest">Posts · newest</option>
              <option value="reel:newest">Reels · newest</option>
            </select>
          </div>

          <div className="no-scrollbar -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-3">
            <Chip active={validCat === ALL} onClick={() => setCat(ALL)}>
              All <span className="font-mono text-xs tabular-nums opacity-60">{posts.length}</span>
            </Chip>
            {categories
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((c) => (
                <Chip key={c.id} active={validCat === c.id} onClick={() => setCat(c.id)} hue={c.hue}>
                  {c.name} <span className="font-mono text-xs tabular-nums opacity-60">{counts.get(c.id) ?? 0}</span>
                </Chip>
              ))}
            {uncategorized > 0 && (
              <Chip active={validCat === UNCATEGORIZED} onClick={() => setCat(UNCATEGORIZED)}>
                Uncategorized <span className="font-mono text-xs tabular-nums opacity-60">{uncategorized}</span>
              </Chip>
            )}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-4">
          {filtered.length === 0 ? (
            <p className="py-20 text-center text-ink-400">{posts.length === 0 ? 'Your library is empty. Import your export in Settings.' : 'No posts match.'}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.slice(0, limit).map((p) => (
                <li key={p.shortcode}>
                  <PostTile
                    post={p}
                    categories={categories}
                    selecting={selecting}
                    selected={selected.has(p.shortcode)}
                    onClick={() => (selecting ? toggle(p.shortcode) : setOpen(p.shortcode))}
                  />
                </li>
              ))}
            </ul>
          )}
          {filtered.length > limit && (
            <div className="mt-6 flex justify-center">
              <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
                Show more ({(filtered.length - limit).toLocaleString()} left)
              </Button>
            </div>
          )}
        </div>
      </div>

      {selecting && selected.size > 0 && (
        <div className="shrink-0 animate-fade-in border-t border-ink-800 bg-ink-900 px-4 py-3">
          <div className="mx-auto flex max-w-5xl gap-2">
            <Button variant="primary" className="flex-1" onClick={() => setAssigning(true)}>
              <IconTag size={18} /> Categories
            </Button>
            <Button variant="danger" onClick={() => setConfirmDelete(true)} aria-label="Delete selected">
              <IconTrash size={18} /> Delete
            </Button>
          </div>
        </div>
      )}

      <CategoryAssignSheet codes={[...selected]} open={assigning} onClose={() => setAssigning(false)} />
      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${plural(selected.size, 'post')}?`}
        body="They'll be removed from Saved Feed on this device. Your saves on Instagram aren't touched. Re-importing your export brings them back."
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          deletePosts([...selected])
          toast(`Deleted ${plural(selected.size, 'post')}`)
          exitSelect()
        }}
      />
      <PostSheet code={open} onClose={() => setOpen(null)} />
    </div>
  )
}

function Chip({ active, onClick, hue, children }: { active: boolean; onClick: () => void; hue?: number; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap transition-colors',
        active ? 'border-transparent bg-ink-100 text-ink-950' : 'border-ink-100/8 bg-ink-900 text-ink-300 hover:bg-ink-800',
      )}
    >
      {hue !== undefined && <span className="size-2 rounded-full" style={{ background: categoryColor(hue) }} />}
      {children}
    </button>
  )
}

/**
 * Instagram doesn't expose thumbnails without an API key, so each post is an
 * index card: what it is, who posted it, when you saved it, where it's filed.
 */
function PostTile({ post, categories, selecting, selected, onClick }: { post: Post; categories: Category[]; selecting: boolean; selected: boolean; onClick: () => void }) {
  const cats = categories.filter((c) => post.categoryIds.includes(c.id))
  const dead = post.status === 'unavailable'
  return (
    <button
      onClick={onClick}
      aria-pressed={selecting ? selected : undefined}
      className={cx(
        'flex h-full w-full flex-col rounded-xl border bg-ink-900 p-3 text-left transition-[background-color,border-color,transform] hover:bg-ink-850 active:scale-[0.98]',
        selected ? 'border-sun-400' : 'border-ink-100/8',
      )}
    >
      <div className="flex h-5 items-center justify-between text-xs text-ink-500">
        <span className="flex items-center gap-1.5">
          {post.kind === 'reel' ? <IconReel size={14} /> : <IconPhoto size={14} />}
          {post.kind === 'reel' ? 'Reel' : post.kind === 'igtv' ? 'Video' : 'Post'}
        </span>
        {selecting ? (
          <span className={cx('grid size-5 place-items-center rounded-full border transition-colors', selected ? 'border-transparent bg-sun-400 text-ink-950' : 'border-ink-600')}>
            {selected && <IconCheck size={13} strokeWidth={2.4} />}
          </span>
        ) : (
          dead && <span className="text-ink-500">Unavailable</span>
        )}
      </div>
      <p className={cx('mt-4 truncate text-[15px] font-medium', dead && 'text-ink-500')}>{post.author ? `@${post.author}` : post.shortcode}</p>
      <p className="mt-0.5 font-mono text-[11px] text-ink-500 tabular-nums">{formatDate(post.savedAt)}</p>
      <div className="mt-3 flex min-h-4 flex-wrap items-center gap-x-3 gap-y-1">
        {cats.slice(0, 2).map((c) => (
          <span key={c.id} className="flex max-w-full items-center gap-1.5 truncate text-xs text-ink-400">
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: categoryColor(c.hue) }} />
            {c.name}
          </span>
        ))}
        {cats.length > 2 && <span className="font-mono text-[11px] text-ink-500">+{cats.length - 2}</span>}
      </div>
    </button>
  )
}

/** Preview a post with its embed, edit its categories, flag or delete it. */
function PostSheet({ code, onClose }: { code: string | null; onClose: () => void }) {
  const { byCode, setStatus, deletePosts } = useLibrary()
  const [{ captions }] = useSettings()
  const toast = useToast()
  const post = code ? byCode.get(code) : undefined
  const w = Math.min(typeof window !== 'undefined' ? window.innerWidth - 40 : 360, 400)
  const h = typeof window !== 'undefined' ? Math.max(260, window.innerHeight * 0.5) : 400

  return (
    <Sheet open={!!post} onClose={onClose} title={post?.author ? `@${post.author}` : 'Post'} tall>
      {post && (
        <div className="flex flex-col gap-5">
          <div className="flex justify-center">
            <Embed
              post={post}
              maxWidth={w}
              maxHeight={h}
              captioned={captions}
              onState={(s) => {
                if (s === 'ok') setStatus(post.shortcode, 'ok')
                if (s === 'unavailable') setStatus(post.shortcode, 'unavailable')
              }}
            />
          </div>
          <p className="text-center font-mono text-xs text-ink-500">
            Saved {formatDate(post.savedAt)} · {post.shortcode}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <a href={post.url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-ink-100/8 bg-ink-800 px-4 text-sm font-medium transition-colors hover:bg-ink-700">
              <IconExternal size={16} /> Instagram
            </a>
            {post.status === 'unavailable' ? (
              <Button size="sm" onClick={() => setStatus(post.shortcode, 'unknown')}>
                <IconRestore size={16} /> Mark available
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStatus(post.shortcode, 'unavailable')}>
                <IconFlag size={16} /> Mark unavailable
              </Button>
            )}
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                deletePosts([post.shortcode])
                toast('Post deleted')
                onClose()
              }}
            >
              <IconTrash size={16} /> Delete
            </Button>
          </div>
          <div>
            <p className="mb-2 text-sm text-ink-400">Categories</p>
            <CategoryAssignList codes={[post.shortcode]} />
          </div>
        </div>
      )}
    </Sheet>
  )
}
