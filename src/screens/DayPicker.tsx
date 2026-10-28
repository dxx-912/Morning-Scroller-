import { IconChevronRight, IconShuffle, Logo } from '../components/icons'
import { ALL, UNCATEGORIZED, countPlayable } from '../lib/feed'
import { cx, plural } from '../lib/util'
import { useLibrary } from '../state/LibraryContext'

function greeting(h = new Date().getHours()) {
  if (h < 5) return 'Up late'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

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

  const date = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())

  return (
    <div className="pt-safe h-full overflow-y-auto">
      <div className="mx-auto flex max-w-lg flex-col px-5 pt-8 pb-10">
        <div className="flex items-center gap-2.5 text-ink-400">
          <Logo size={22} />
          <span className="text-sm font-medium">{date}</span>
        </div>
        <h1 className="font-display mt-5 text-[34px] leading-[1.1] font-bold tracking-tight">
          {greeting()}.
          <br />
          <span className="text-sunrise">What's today about?</span>
        </h1>
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-400">
          <IconShuffle size={16} />
          Pick one. The order is shuffled fresh each day.
        </p>

        <ul className="mt-7 flex flex-col gap-2">
          {options.map((o, i) => (
            <li key={o.id} className="animate-pop" style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}>
              <button
                disabled={o.count === 0}
                onClick={() => chooseCategory(o.id)}
                className={cx(
                  'group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border px-4 py-4 text-left transition active:scale-[0.99] disabled:opacity-40',
                  o.id === ALL ? 'border-sun-500/40 bg-ink-900' : 'border-ink-800 bg-ink-900 hover:border-ink-700',
                )}
              >
                <span
                  className={cx('grid size-11 shrink-0 place-items-center rounded-xl text-lg font-bold text-ink-950', o.id === ALL && 'bg-sunrise')}
                  style={o.hue !== null ? { background: `linear-gradient(135deg, hsl(${o.hue} 90% 72%), hsl(${(o.hue + 35) % 360} 85% 58%))` } : o.id === UNCATEGORIZED ? { background: 'var(--color-ink-700)', color: 'var(--color-ink-300)' } : undefined}
                  aria-hidden="true"
                >
                  {o.id === ALL ? <IconShuffle size={20} strokeWidth={2.2} /> : o.name.trim().charAt(0).toUpperCase() || '#'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold">{o.name}</span>
                  <span className="text-[13px] text-ink-400">{o.count === 0 ? 'Empty' : plural(o.count, 'post')}</span>
                </span>
                <IconChevronRight size={20} className="shrink-0 text-ink-500 transition group-hover:translate-x-0.5 group-hover:text-ink-300" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
