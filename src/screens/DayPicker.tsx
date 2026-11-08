import { IconChevronRight, IconShuffle, Logo } from '../components/icons'
import { ALL, UNCATEGORIZED, countPlayable } from '../lib/feed'
import { categoryColor, cx } from '../lib/util'
import { useLibrary } from '../state/LibraryContext'

/**
 * Today: a masthead for the day's edition, then its sections. Picking one
 * opens the feed; the order is shuffled once a day.
 */
export function DayPicker() {
  const { posts, categories, chooseCategory } = useLibrary()

  const options = [
    { id: ALL, name: 'All saved', hue: null as number | null, count: countPlayable(posts, ALL) },
    ...categories
      .map((c) => ({ id: c.id, name: c.name, hue: c.hue as number | null, count: countPlayable(posts, c.id) }))
      .sort((a, b) => (b.count > 0 ? 1 : 0) - (a.count > 0 ? 1 : 0) || a.name.localeCompare(b.name)),
  ]
  const uncategorized = countPlayable(posts, UNCATEGORIZED)
  if (uncategorized > 0 && categories.length > 0) options.push({ id: UNCATEGORIZED, name: 'Uncategorized', hue: null, count: uncategorized })

  const now = new Date()
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(now)
  const date = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' }).format(now)

  return (
    <div className="pt-safe h-full overflow-y-auto">
      <div className="mx-auto flex max-w-lg animate-rise flex-col px-5 pt-6 pb-12">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[15px] font-medium">
            <Logo size={18} />
            Saved Feed
          </span>
          <span className="font-mono text-xs text-ink-500 tabular-nums">{options[0].count.toLocaleString()} saved</span>
        </div>

        <header className="mt-6 border-t border-ink-100/15 pt-4">
          <p className="font-mono text-xs text-ink-500">{weekday}</p>
          <h1 className="font-display mt-1 text-[44px] leading-[1.02] tracking-[-0.02em]">{date}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-400">Pick today's section. The order is shuffled once a day and stays put until tomorrow.</p>
        </header>

        <ul className="mt-8 border-t border-ink-100/8">
          {options.map((o) => (
            <li key={o.id} className="border-b border-ink-100/8">
              <button
                disabled={o.count === 0}
                onClick={() => chooseCategory(o.id)}
                className="group flex h-14 w-full items-center gap-3 px-1 text-left transition-colors hover:bg-ink-900 active:bg-ink-900 disabled:opacity-40"
              >
                <span className="grid size-5 shrink-0 place-items-center" aria-hidden="true">
                  {o.id === ALL ? (
                    <IconShuffle size={18} className="text-sun-400" />
                  ) : (
                    <span
                      className={cx('size-2 rounded-full', o.hue === null && 'border border-ink-500')}
                      style={o.hue !== null ? { background: categoryColor(o.hue) } : undefined}
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-base">{o.name}</span>
                <span className="font-mono text-xs text-ink-500 tabular-nums">{o.count === 0 ? 'empty' : o.count.toLocaleString()}</span>
                <IconChevronRight size={18} className="shrink-0 text-ink-600 transition-colors group-hover:text-ink-400" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
