import { useMemo, useState } from 'react'
import { IconCheck, IconChevronRight, IconPencil, IconPlus, IconTrash } from '../components/icons'
import { Button, ConfirmSheet } from '../components/Sheet'
import { useToast } from '../components/Toast'
import type { Category } from '../lib/types'
import { categoryColor, plural } from '../lib/util'
import { useLibrary } from '../state/LibraryContext'

export function Categories() {
  const { categories, posts, createCategory, renameCategory, deleteCategory } = useLibrary()
  const toast = useToast()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of posts) for (const id of p.categoryIds) m.set(id, (m.get(id) ?? 0) + 1)
    return m
  }, [posts])

  const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name))
  const nameTaken = (name: string, except?: string) => categories.some((c) => c.id !== except && c.name.toLowerCase() === name.trim().toLowerCase())

  const create = async () => {
    const name = draft.trim()
    if (!name) return
    if (nameTaken(name)) return toast(`"${name}" already exists`)
    await createCategory(name)
    setDraft('')
  }

  return (
    <div className="pt-safe h-full overflow-y-auto">
      <div className="mx-auto max-w-lg px-4 pt-4 pb-10">
        <h1 className="font-display text-[32px] leading-none">Categories</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-400">Instagram collections are imported as categories. Add your own, rename or delete any of them.</p>

        <form
          className="mt-5 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            create()
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="New category name"
            maxLength={40}
            className="h-11 min-w-0 flex-1 rounded-[10px] border border-ink-100/8 bg-ink-900 px-4 text-[15px] placeholder:text-ink-500 focus:border-sun-500/60 focus:outline-none"
          />
          <Button type="submit" variant="primary" disabled={!draft.trim()}>
            <IconPlus size={18} /> Create
          </Button>
        </form>

        <ul className="mt-6 divide-y divide-ink-100/8 overflow-hidden rounded-2xl border border-ink-100/8 bg-ink-900">
          {sorted.length === 0 && <li className="px-4 py-10 text-center text-sm text-ink-400">No categories yet.</li>}
          {sorted.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <span className="size-2 shrink-0 rounded-full" style={{ background: categoryColor(c.hue) }} />
              {editing === c.id ? (
                <RenameForm
                  initial={c.name}
                  onCancel={() => setEditing(null)}
                  onSave={async (name) => {
                    if (nameTaken(name, c.id)) return toast(`"${name}" already exists`)
                    await renameCategory(c.id, name)
                    setEditing(null)
                  }}
                />
              ) : (
                <>
                  <a href={`#/library?c=${encodeURIComponent(c.id)}`} className="group min-w-0 flex-1">
                    <span className="flex items-center gap-1 truncate text-[15px]">
                      {c.name}
                      <IconChevronRight size={16} className="shrink-0 text-ink-600 transition-colors group-hover:text-ink-400" />
                    </span>
                    <span className="text-xs text-ink-500">
                      <span className="font-mono tabular-nums">{plural(counts.get(c.id) ?? 0, 'post')}</span>
                      {c.source === 'instagram' && ' · from Instagram'}
                      {c.source === 'instagram' && c.igName && c.igName !== c.name && ` (“${c.igName}”)`}
                    </span>
                  </a>
                  <button onClick={() => setEditing(c.id)} className="rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-800 hover:text-ink-100" aria-label={`Rename ${c.name}`}>
                    <IconPencil size={18} />
                  </button>
                  <button onClick={() => setDeleting(c)} className="rounded-lg p-2 text-ink-500 transition-colors hover:bg-danger/12 hover:text-danger" aria-label={`Delete ${c.name}`}>
                    <IconTrash size={18} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>

      <ConfirmSheet
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        body={
          <>
            The {plural(counts.get(deleting?.id ?? '') ?? 0, 'post')} in it stay in your library; they just lose this category.
            {deleting?.source === 'instagram' && ' Re-importing your Instagram export will bring it back.'}
          </>
        }
        confirmLabel="Delete category"
        danger
        onConfirm={() => {
          if (deleting) deleteCategory(deleting.id)
        }}
      />
    </div>
  )
}

function RenameForm({ initial, onSave, onCancel }: { initial: string; onSave: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial)
  return (
    <form
      className="flex min-w-0 flex-1 items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) onSave(name.trim())
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        maxLength={40}
        className="h-9 min-w-0 flex-1 rounded-lg border border-sun-500/60 bg-ink-950 px-3 text-[15px] focus:outline-none"
        aria-label="Category name"
      />
      <button type="submit" className="rounded-lg p-2 text-ok transition-colors hover:bg-ink-800" aria-label="Save">
        <IconCheck size={18} />
      </button>
    </form>
  )
}
