import { useEffect } from 'react'
import { Logo } from './components/icons'
import { TabBar } from './components/TabBar'
import { ToastProvider } from './components/Toast'
import { UpdatePrompt } from './components/UpdatePrompt'
import { Categories } from './screens/Categories'
import { DayPicker } from './screens/DayPicker'
import { Feed } from './screens/Feed'
import { Library } from './screens/Library'
import { Intro } from './screens/Intro'
import { Onboarding } from './screens/Onboarding'
import { Settings } from './screens/Settings'
import { LibraryProvider, useLibrary } from './state/LibraryContext'
import { useOnboarding } from './state/onboarding'
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
  const { introSeen, replaying, finishIntro } = useOnboarding()
  const empty = posts.length === 0

  // Anyone with a library already knows the app: an existing user, or someone
  // who just restored a backup. Count the intro as seen for them.
  useEffect(() => {
    if (ready && !empty && introSeen === false) finishIntro()
  }, [ready, empty, introSeen, finishIntro])

  if (!ready || introSeen === undefined) {
    return (
      <div className="grid h-full place-items-center">
        <div className="animate-pulse">
          <Logo size={44} />
        </div>
      </div>
    )
  }

  // First visit (once per browser), or replayed from Settings.
  if (replaying || (empty && !introSeen)) return <Intro onDone={finishIntro} replay={replaying} />

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
