import { Logo } from './components/icons'
import { TabBar } from './components/TabBar'
import { ToastProvider } from './components/Toast'
import { UpdatePrompt } from './components/UpdatePrompt'
import { Categories } from './screens/Categories'
import { DayPicker } from './screens/DayPicker'
import { Feed } from './screens/Feed'
import { Library } from './screens/Library'
import { Onboarding } from './screens/Onboarding'
import { Settings } from './screens/Settings'
import { LibraryProvider, useLibrary } from './state/LibraryContext'
import { useRoute } from './state/router'

export default function App() {
  return (
    <ToastProvider>
      <LibraryProvider>
        <Shell />
        <UpdatePrompt />
      </LibraryProvider>
    </ToastProvider>
  )
}

function Shell() {
  const route = useRoute()
  const { ready, posts, todayCategory, today } = useLibrary()

  if (!ready) {
    return (
      <div className="grid h-full place-items-center">
        <div className="animate-pulse">
          <Logo size={44} />
        </div>
      </div>
    )
  }

  const empty = posts.length === 0
  const dead = posts.reduce((n, p) => n + (p.status === 'unavailable' ? 1 : 0), 0)

  let screen
  if (route === 'library') screen = <Library />
  else if (route === 'categories') screen = <Categories />
  else if (route === 'settings') screen = <Settings />
  else if (empty) screen = <Onboarding />
  else if (!todayCategory) screen = <DayPicker />
  // Keyed so the feed rebuilds its shuffle when the day or category changes.
  else screen = <Feed key={`${today}:${todayCategory}`} categoryId={todayCategory} />

  return (
    <div className="flex h-full flex-col">
      <main className="relative flex min-h-0 flex-1 flex-col">{screen}</main>
      {!(empty && route === 'feed') && <TabBar route={route} badge={{ settings: dead }} />}
    </div>
  )
}
