import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from './Sheet'

/** Service worker registration plus a small banner when a new version is ready. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: (e) => console.warn('[saved-feed] service worker registration failed', e),
  })

  if (!needRefresh) return null
  return (
    <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+8px)] z-[70] flex justify-center px-4">
      <div className="flex animate-pop items-center gap-2 rounded-xl border border-ink-100/8 bg-ink-800 py-2 pr-2 pl-4 text-sm shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
        <span className="mr-1">New version ready</span>
        <Button size="sm" variant="primary" onClick={() => updateServiceWorker(true)}>
          Reload
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
          Later
        </Button>
      </div>
    </div>
  )
}
