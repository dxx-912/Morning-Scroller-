import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

interface ToastItem {
  id: number
  text: string
  action?: { label: string; run: () => void }
}

type Show = (text: string, action?: ToastItem['action'], ms?: number) => void

const Ctx = createContext<Show>(() => {})

export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const show = useCallback<Show>((text, action, ms = 3200) => {
    const id = nextId.current++
    setItems((xs) => [...xs.slice(-2), { id, text, action }])
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), ms)
  }, [])

  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex max-w-sm animate-pop items-center gap-3 rounded-2xl border border-ink-700 bg-ink-800/95 py-2.5 pr-2.5 pl-4 text-sm shadow-xl backdrop-blur"
          >
            <span className="flex-1">{t.text}</span>
            {t.action && (
              <button
                className="rounded-full px-3 py-1 font-semibold text-sun-400 hover:bg-ink-700"
                onClick={() => {
                  t.action!.run()
                  setItems((xs) => xs.filter((x) => x.id !== t.id))
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
