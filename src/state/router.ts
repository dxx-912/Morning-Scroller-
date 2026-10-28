import { useSyncExternalStore } from 'react'

/** Hash routes keep the PWA working on any static host without rewrite rules. */
export type Route = 'feed' | 'library' | 'categories' | 'settings'

const ROUTES: Route[] = ['feed', 'library', 'categories', 'settings']

function read(): Route {
  const r = location.hash.replace(/^#\/?/, '').split(/[?/]/)[0]
  return (ROUTES as string[]).includes(r) ? (r as Route) : 'feed'
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, read, () => 'feed')
}

export function navigate(route: Route) {
  const hash = route === 'feed' ? '#/' : `#/${route}`
  if (location.hash !== hash) location.hash = hash
}
