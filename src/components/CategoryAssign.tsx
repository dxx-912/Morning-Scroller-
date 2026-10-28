import { useState } from 'react'
import { useLibrary } from '../state/LibraryContext'
import { cx, plural } from '../lib/util'
import { Button, Sheet } from './Sheet'
import { IconCheck, IconPlus } from './icons'

/**
 * Toggle categories for one or many posts. With several posts selected a
 * category can be "mixed" (some have it); tapping it adds it to all of them.
 */
export function CategoryAssignList({ codes }: { codes: string[] }) {
  const { categories, byCode, updatePostCategories, createCategory } = useLibrary()
  const [draft, setDraft] = useState('')

  const posts = codes.map((c) => byCode.get(c)).filter((p) => !!p)
  const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name))

  const add = async () => {
    const name = draft.trim()
    if (!name) return
    const existing = categories.find((c) => c.name.toLowerCase() === name.toLowerCase())
    const cat = existing ?? (await createCategory(name))
    await updatePostCategories(codes, [cat.id], [])
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-1.5">
      <form
        className="mb-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="New category"
          maxLength={40}
          className="h-11 min-w-0 flex-1 rounded-full border border-ink-700 bg-ink-900 px-4 text-[15px] placeholder:text-ink-500 focus:border-sun-500 focus:outline-none"
        />
        <Button type="submit" variant="secondary" disabled={!draft.trim()} aria-label="Create category">
          <IconPlus size={18} />
          Add
        </Button>
      </form>
      {sorted.length === 0 && <p className="py-6 text-center text-sm text-ink-400">No categories yet. Create one above.</p>}
      {sorted.map((cat) => {
        const n = posts.filter((p) => p.categoryIds.includes(cat.id)).length
        const all = n > 0 && n === posts.length
        const some = n > 0 && !all
        return (
          <button
            key={cat.id}
            role="checkbox"
            aria-checked={all ? 'true' : some ? 'mixed' : 'false'}
            onClick={() => updatePostCategories(codes, all ? [] : [cat.id], all ? [cat.id] : [])}
            className={cx(
              'flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition',
              all ? 'bg-ink-800' : 'hover:bg-ink-800/60',
            )}
          >
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: `hsl(${cat.hue} 85% 65%)` }} />
            <span className="flex-1 truncate text-[15px]">{cat.name}</span>
            {some && <span className="text-xs text-ink-400">{n} of {posts.length}</span>}
            <span
              className={cx(
                'grid size-6 place-items-center rounded-full border transition',
                all ? 'border-transparent bg-sunrise text-ink-950' : some ? 'border-sun-500 text-sun-400' : 'border-ink-600',
              )}
            >
              {all && <IconCheck size={15} strokeWidth={2.6} />}
              {some && <span className="h-0.5 w-2.5 rounded-full bg-current" />}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function CategoryAssignSheet({ codes, open, onClose }: { codes: string[]; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={codes.length > 1 ? `Categories for ${plural(codes.length, 'post')}` : 'Categories'} tall>
      <CategoryAssignList codes={codes} />
    </Sheet>
  )
}
