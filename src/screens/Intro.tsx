import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { BackupImportButton } from '../components/BackupControls'
import { IconCheck, IconExternal, IconFlag, IconPlay, IconShuffle, IconTag, IconUpload, Logo } from '../components/icons'
import { Button } from '../components/Sheet'
import { cx } from '../lib/util'

/**
 * The one-time intro: what Saved Feed is for, how it works, and what it does
 * on its own. Swipe or use the buttons; Skip is always there. Shown once per
 * browser (see state/onboarding.ts), and again from Settings on request.
 */

interface Slide {
  title: ReactNode
  body: ReactNode
  art: ReactNode
}

const SLIDES: Slide[] = [
  {
    title: (
      <>
        Your saves,
        <br />
        <span className="text-sunrise">actually seen.</span>
      </>
    ),
    body: 'You save posts to come back to. You rarely do. Saved Feed turns them into a short, calm feed you can get through each day.',
    art: <ArtStack />,
  },
  {
    title: 'Bring them in once',
    body: 'Download your data from Instagram and drop the file in. Your saved collections become categories. Takes a minute.',
    art: <ArtSteps />,
  },
  {
    title: 'One category a day',
    body: 'Each morning, pick a category or everything. The order is shuffled, stays put all day, and reshuffles tomorrow. Reopen it and you pick up where you left off.',
    art: <ArtCategories />,
  },
  {
    title: 'Scroll like Instagram',
    body: 'Full-screen posts. Swipe up for the next one, tap a reel to play it. Tag it into categories, open it in Instagram, or flag it.',
    art: <ArtPhone />,
  },
  {
    title: 'Keeps itself tidy',
    body: 'Deleted posts drop out before you reach them. Reels that only play on Instagram are skipped once you hit one. Review them anytime in Settings.',
    art: <ArtTidy />,
  },
  {
    title: 'Private by design',
    body: 'No account, no Instagram login. Your library lives only on this device. Back it up to move to another phone, and add the app to your home screen.',
    art: <ArtPrivate />,
  },
]

export function Intro({ onDone, replay = false }: { onDone: () => void; replay?: boolean }) {
  const track = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(0)
  const last = step === SLIDES.length - 1

  const goTo = useCallback((i: number) => {
    const el = track.current
    if (!el) return
    const n = Math.max(0, Math.min(SLIDES.length - 1, i))
    el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' })
  }, [])

  const onScroll = () => {
    const el = track.current
    if (el?.clientWidth) setStep(Math.round(el.scrollLeft / el.clientWidth))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goTo(step + 1)
      else if (e.key === 'ArrowLeft') goTo(step - 1)
      else if (e.key === 'Escape') onDone()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, goTo, onDone])

  return (
    <div className="pt-safe pb-safe flex h-full flex-col bg-ink-950" role="region" aria-roledescription="carousel" aria-label="How Saved Feed works">
      <div className="mx-auto flex w-full max-w-md items-center justify-between px-5 pt-3">
        <Logo size={28} />
        {!last && (
          <button onClick={onDone} className="rounded-full px-3 py-1.5 text-sm font-semibold text-ink-400 hover:bg-ink-800 hover:text-ink-100">
            {replay ? 'Close' : 'Skip'}
          </button>
        )}
      </div>

      <div ref={track} onScroll={onScroll} className="no-scrollbar flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain">
        {SLIDES.map((s, i) => (
          <section
            key={i}
            className="flex w-full shrink-0 snap-center flex-col justify-center-safe overflow-y-auto px-5 py-4"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${SLIDES.length}`}
            aria-hidden={i !== step}
          >
            <div className="mx-auto flex w-full max-w-md flex-col">
              <div className="mb-6 flex h-48 shrink-0 items-center justify-center sm:mb-8 sm:h-56">{s.art}</div>
              <h1 className={cx('font-display font-bold tracking-tight', i === 0 ? 'text-[36px] leading-[1.05]' : 'text-[28px] leading-tight')}>{s.title}</h1>
              <p className="mt-3 text-[16px] leading-relaxed text-ink-300">{s.body}</p>
              {i === 0 && !replay && (
                <p className="mt-6 text-sm text-ink-500">
                  Already use Saved Feed? <BackupImportButton className="font-semibold text-sun-400 hover:underline">Restore a backup</BackupImportButton>
                </p>
              )}
            </div>
          </section>
        ))}
      </div>

      <div className="mx-auto flex w-full max-w-md items-center gap-3 px-5 pt-4 pb-6">
        <div className="flex flex-1 gap-1.5" aria-hidden>
          {SLIDES.map((_, i) => (
            <button
              key={i}
              tabIndex={-1}
              onClick={() => goTo(i)}
              className={cx('h-1.5 rounded-full transition-all', i === step ? 'w-6 bg-sun-400' : 'w-1.5 bg-ink-700')}
            />
          ))}
        </div>
        <span className="sr-only" aria-live="polite">
          Step {step + 1} of {SLIDES.length}
        </span>
        {step > 0 && (
          <Button variant="ghost" onClick={() => goTo(step - 1)}>
            Back
          </Button>
        )}
        <Button variant="primary" onClick={() => (last ? onDone() : goTo(step + 1))}>
          {last ? (replay ? 'Done' : 'Import my saves') : 'Next'}
        </Button>
      </div>
    </div>
  )
}

// ---------- small illustrations, drawn with the app's own pieces ----------

function Card({ className = '', children }: { className?: string; children?: ReactNode }) {
  return <div className={cx('rounded-2xl border border-ink-700 bg-ink-850', className)}>{children}</div>
}

function ArtStack() {
  return (
    <div className="relative h-52 w-40">
      <Card className="absolute inset-0 translate-x-6 rotate-6 opacity-50" />
      <Card className="absolute inset-0 -translate-x-6 -rotate-6 opacity-70" />
      <Card className="absolute inset-0 grid place-items-center bg-gradient-to-b from-ink-800 to-ink-850">
        <Logo size={48} />
      </Card>
    </div>
  )
}

function ArtSteps() {
  const steps = [
    { icon: <IconUpload size={20} />, label: 'Download your Instagram data' },
    { icon: <span className="text-sm font-bold">.zip</span>, label: 'Drop the file in' },
    { icon: <IconTag size={20} />, label: 'Collections → categories' },
  ]
  return (
    <div className="flex w-full max-w-xs flex-col gap-2.5">
      {steps.map((s, i) => (
        <Card key={i} className="flex items-center gap-3 px-4 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink-800 text-sun-400">{s.icon}</span>
          <span className="text-sm font-medium text-ink-100">{s.label}</span>
        </Card>
      ))}
    </div>
  )
}

function ArtCategories() {
  const cats = [
    { name: 'All saved', hue: null, on: true },
    { name: 'Recipes', hue: 20 },
    { name: 'Travel', hue: 190 },
    { name: 'Motivation', hue: 90 },
  ]
  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      {cats.map((c) => (
        <Card key={c.name} className={cx('flex items-center gap-3 px-3 py-2.5', c.on && 'border-sun-500/60')}>
          <span
            className={cx('grid size-8 place-items-center rounded-lg text-sm font-bold text-ink-950', c.hue === null && 'bg-sunrise')}
            style={c.hue !== null ? { background: `hsl(${c.hue} 85% 65%)` } : undefined}
          >
            {c.hue === null ? <IconShuffle size={16} /> : c.name[0]}
          </span>
          <span className="flex-1 text-sm font-medium">{c.name}</span>
          {c.on && <IconCheck size={18} className="text-sun-400" />}
        </Card>
      ))}
    </div>
  )
}

function ArtPhone() {
  return (
    <div className="relative h-56 w-32 overflow-hidden rounded-[22px] border-2 border-ink-700 bg-gradient-to-b from-ink-700 via-ink-800 to-ink-900">
      <span className="absolute top-1/2 left-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white">
        <IconPlay size={18} />
      </span>
      <div className="absolute inset-x-0 bottom-0 flex items-end gap-1 bg-gradient-to-t from-black/70 to-transparent p-2 pt-8 text-white">
        <span className="flex-1 truncate text-[10px] font-semibold">@account</span>
        <IconTag size={13} />
        <IconExternal size={13} />
        <IconFlag size={13} />
      </div>
    </div>
  )
}

function ArtTidy() {
  const rows = [
    { label: 'Deleted post', note: 'Skipped before you got there' },
    { label: 'Reel', note: 'Only plays on Instagram' },
  ]
  return (
    <div className="flex w-full max-w-xs flex-col gap-2.5">
      {rows.map((r) => (
        <Card key={r.label} className="flex items-center gap-3 px-4 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink-800 text-ink-400">
            <IconFlag size={18} />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-medium text-ink-100 line-through decoration-ink-500">{r.label}</span>
            <span className="block text-xs text-ink-500">{r.note}</span>
          </span>
        </Card>
      ))}
    </div>
  )
}

function ArtPrivate() {
  return (
    <div className="relative grid size-44 place-items-center">
      <div className="absolute inset-0 rounded-full border border-dashed border-ink-700" />
      <div className="absolute inset-6 rounded-full border border-ink-800 bg-ink-900" />
      <div className="relative flex flex-col items-center gap-1.5">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="text-sun-400" aria-hidden="true">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        <span className="text-xs font-semibold text-ink-300">On this device</span>
      </div>
    </div>
  )
}
