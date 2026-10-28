import { navigate, type Route } from '../state/router'
import { cx } from '../lib/util'
import { IconFeed, IconGrid, IconSettings, IconTag } from './icons'

const TABS: { route: Route; label: string; Icon: typeof IconFeed }[] = [
  { route: 'feed', label: 'Today', Icon: IconFeed },
  { route: 'library', label: 'Library', Icon: IconGrid },
  { route: 'categories', label: 'Categories', Icon: IconTag },
  { route: 'settings', label: 'Settings', Icon: IconSettings },
]

export const TAB_BAR_HEIGHT = 60

export function TabBar({ route, badge }: { route: Route; badge?: Partial<Record<Route, number>> }) {
  return (
    <nav className="pb-safe relative z-30 shrink-0 border-t border-ink-800 bg-ink-950/95 backdrop-blur" aria-label="Main">
      <ul className="mx-auto flex max-w-lg" style={{ height: TAB_BAR_HEIGHT }}>
        {TABS.map(({ route: r, label, Icon }) => {
          const active = r === route
          const n = badge?.[r]
          return (
            <li key={r} className="flex-1">
              <button
                onClick={() => navigate(r)}
                aria-current={active ? 'page' : undefined}
                className={cx('relative flex h-full w-full flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition', active ? 'text-ink-100' : 'text-ink-500 hover:text-ink-300')}
              >
                <Icon size={23} strokeWidth={active ? 2.1 : 1.7} />
                {label}
                {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-sunrise" />}
                {!!n && <span className="absolute top-2 left-[calc(50%+8px)] min-w-4 rounded-full bg-sun-600 px-1 text-[10px] leading-4 font-bold text-ink-950">{n > 99 ? '99+' : n}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
