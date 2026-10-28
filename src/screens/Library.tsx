import { useEffect, useMemo, useState } from 'react'
import { CategoryAssignList, CategoryAssignSheet } from '../components/CategoryAssign'
import { Embed } from '../components/Embed'
import { IconCheck, IconClose, IconExternal, IconFlag, IconPhoto, IconReel, IconRestore, IconSearch, IconSelect, IconTag, IconTrash } from '../components/icons'
import { Button, ConfirmSheet, Sheet } from '../components/Sheet'
import { useToast } from '../components/Toast'
import { ALL, UNCATEGORIZED, inCategory } from '../lib/feed'
import { hashString } from '../lib/shuffle'
import type { Category, Post } from '../lib/types'
import { cx, formatDate, plural } from '../lib/util'
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
      <header className="pt-safe shrink-0 border-b border-ink-800/80 bg-ink-950">
        <div className="mx-auto max-w-5xl px-4 pt-4">
          <div className="flex items-center justify-between gap-3">
            {selecting ? (
              <>
                <button onClick={exitSelect} className="-ml-2 flex items-center gap-1 rounded-full p-2 text-ink-300 hover:text-ink-100" aria-label="Cancel selection">
                  <IconClose size={20} />
                </button>
                <h1 className="flex-1 text-lg font-semibold">{selected.size ? `${selected.size} selected` : 'Select posts'}</h1>
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
                <h1 className="font-display text-2xl font-bold tracking-tight">
                  Library <span className="text-base font-medium text-ink-500">{posts.length.toLocaleString()}</span>
                </h1>
                <Button size="sm" variant="secondary" onClick={() => setSelecting(true)} disabled={posts.length === 0}>
                  <IconSelect size={17} /> Select
                </Button>
              </>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-ink-900 px-3.5 text-ink-400 focus-within:ring-1 focus-within:ring-sun-500">
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
              className="h-10 rounded-full bg-ink-900 px-3 text-sm text-ink-300 focus:outline-none"
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
              All <span className="opacity-60">{posts.length}</span>
            </Chip>
            {categories
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((c) => (
                <Chip key={c.id} active={validCat === c.id} onClick={() => setCat(c.id)} hue={c.hue}>
                  {c.name} <span className="opacity-60">{counts.get(c.id) ?? 0}</span>
                </Chip>
              ))}
            {uncategorized > 0 && (
              <Chip active={validCat === UNCATEGORIZED} onClick={() => setCat(UNCATEGORIZED)}>
                Uncategorized <span className="opacity-60">{uncategorized}</span>
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
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
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
        'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition',
        active ? 'bg-ink-100 text-ink-950' : 'bg-ink-900 text-ink-300 hover:bg-ink-800',
      )}
    >
      {hue !== undefined && <span className="size-2 rounded-full" style={{ background: `hsl(${hue} 85% ${active ? 45 : 65}%)` }} />}
      {children}
    </button>
  )
}

/** Instagram doesn't expose thumbnails without an API key, so each tile gets a generated gradient. */
function PostTile({ post, categories, selecting, selected, onClick }: { post: Post; categories: Category[]; selecting: boolean; selected: boolean; onClick: () => void }) {
  const h = hashString(post.shortcode)
  const hue = h % 360
  const angle = (h >> 9) % 360
  const cats = categories.filter((c) => post.categoryIds.includes(c.id))
  const dead = post.status === 'unavailable'
  return (
    <button
      onClick={onClick}
      aria-pressed={selecting ? selected : undefined}
      className={cx(
        'group relative flex aspect-[4/5] w-full flex-col justify-between overflow-hidden rounded-2xl p-3 text-left transition active:scale-[0.98]',
        selected && 'ring-2 ring-sun-500 ring-offset-2 ring-offset-ink-950',
        dead && 'opacity-50 grayscale',
      )}
      style={{
        background: `linear-gradient(${angle}deg, hsl(${hue} 45% 20%), hsl(${(hue + 50) % 360} 55% 12%) 70%), var(--color-ink-900)`,
      }}
    >
      <div className="flex items-start justify-between">
        <span className="flex items-center gap-1 rounded-full bg-black/35 px-2 py-1 text-[11px] font-semibold text-white/85 backdrop-blur">
          {post.kind === 'reel' ? <IconReel size={13} /> : <IconPhoto size={13} />}
          {post.kind === 'reel' ? 'Reel' : post.kind === 'igtv' ? 'Video' : 'Post'}
        </span>
        {selecting ? (
          <span className={cx('grid size-6 place-items-center rounded-full border-2', selected ? 'border-transparent bg-sunrise text-ink-950' : 'border-white/60 bg-black/20')}>
            {selected && <IconCheck size={14} strokeWidth={3} />}
          </span>
        ) : (
          dead && <span className="rounded-full bg-black/50 px-2 py-1 text-[10px] font-bold tracking-wide text-white uppercase">Unavailable</span>
        )}
      </div>
      <span className="font-display pointer-events-none absolute inset-0 grid place-items-center text-5xl font-bold text-white/10 select-none" aria-hidden="true">
        {(post.author ?? post.shortcode).charAt(0).toUpperCase()}
      </span>
      <div className="relative min-w-0">
        <p className="truncate text-sm font-semibold text-white">{post.author ? `@${post.author}` : post.shortcode}</p>
        <p className="text-[11px] text-white/60">{formatDate(post.savedAt)}</p>
        {cats.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {cats.slice(0, 2).map((c) => (
              <span key={c.id} className="max-w-full truncate rounded-full bg-black/35 px-2 py-0.5 text-[10.5px] text-white/85">
                {c.name}
              </span>
            ))}
            {cats.length > 2 && <span className="rounded-full bg-black/35 px-1.5 py-0.5 text-[10.5px] text-white/70">+{cats.length - 2}</span>}
          </div>
        )}
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
          <p className="text-center text-xs text-ink-500">
            Saved {formatDate(post.savedAt)} · {post.shortcode}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <a href={post.url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink-800 px-3.5 text-sm font-semibold hover:bg-ink-700">
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
            <p className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">Categories</p>
            <CategoryAssignList codes={[post.shortcode]} />
          </div>
        </div>
      )}
    </Sheet>
  )
}
