import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BackupImportButton } from '../components/BackupControls'
import { InstallGuide } from '../components/InstallGuide'
import { IconCheck, IconExternal, IconFlag, IconPlay, IconShuffle, IconTag, IconUpload, Logo } from '../components/icons'
import { Button } from '../components/Sheet'
import { detectPlatform, type Platform } from '../lib/platform'
import { categoryColor, cx } from '../lib/util'

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
        actually seen.
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
  // After the slides: how to put it on the Home Screen. Not when it's already
  // there, and not when replaying from Settings (Settings has its own guide).
  const platform = useMemo(() => detectPlatform(), [])
  const withInstall = !replay && platform !== 'installed'
  const [phase, setPhase] = useState<'slides' | 'install'>('slides')
  const finishSlides = useCallback(() => (withInstall ? setPhase('install') : onDone()), [withInstall, onDone])

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
      else if (e.key === 'Escape') finishSlides()
    }
    if (phase !== 'slides') return
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, goTo, finishSlides, phase])

  if (phase === 'install') return <InstallStep platform={platform} onDone={onDone} />

  return (
    <div className="pt-safe pb-safe flex h-full flex-col bg-ink-950" role="region" aria-roledescription="carousel" aria-label="How Saved Feed works">
      <div className="mx-auto flex w-full max-w-md items-center justify-between px-5 pt-3">
        <Logo size={28} />
        {!last && (
          <button onClick={finishSlides} className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-100">
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
              <ArtStage>{s.art}</ArtStage>
              <h1 className={cx('font-display', i === 0 ? 'text-[44px] leading-[1.02] tracking-[-0.02em]' : 'text-[34px] leading-[1.08]')}>{s.title}</h1>
              {/* Room for 4 lines, so titles line up from slide to slide. */}
              <p className="mt-3 min-h-[4lh] text-[16px] leading-relaxed text-ink-300">{s.body}</p>
              {i === 0 && !replay && (
                <p className="mt-6 text-sm text-ink-500">
                  Already use Saved Feed? <BackupImportButton className="font-medium text-ink-100 underline decoration-ink-600 underline-offset-4 transition-colors hover:decoration-ink-400">Restore a backup</BackupImportButton>
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
              className={cx('size-1.5 rounded-full transition-colors', i === step ? 'bg-sun-400' : 'bg-ink-700')}
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
        <Button variant="primary" onClick={() => (last ? finishSlides() : goTo(step + 1))}>
          {last ? (replay ? 'Done' : withInstall ? 'Next' : 'Import my saves') : 'Next'}
        </Button>
      </div>
    </div>
  )
}

// ---------- the last step: put it on the Home Screen ----------

const INSTALL_COPY: Record<Platform, { title: string; body: string; done?: string; skip: string }> = {
  'ios-safari': { title: 'Put it on your Home Screen', body: 'It opens full-screen, like an app. Takes 20 seconds.', done: 'I’ve added it', skip: 'Not now' },
  'ios-other': { title: 'Put it on your Home Screen', body: 'It opens full-screen, like an app. Takes 20 seconds.', done: 'I’ve added it', skip: 'Not now' },
  'in-app': { title: 'Open it in your browser first', body: 'To keep Saved Feed on your Home Screen, it needs to be open in Safari or Chrome.', skip: 'Continue here anyway' },
  android: { title: 'Put it on your home screen', body: 'It opens full-screen, like an app.', skip: 'Continue' },
  desktop: { title: 'Made for your phone', body: 'Saved Feed works best as an app on your phone’s Home Screen.', skip: 'Continue on this computer' },
  installed: { title: '', body: '', skip: 'Continue' },
}

function InstallStep({ platform, onDone }: { platform: Platform; onDone: () => void }) {
  const [added, setAdded] = useState(false)
  const copy = INSTALL_COPY[platform]

  if (added) {
    return (
      <div className="pt-safe pb-safe flex h-full flex-col items-center justify-center bg-ink-950 px-8 text-center">
        <div className="grid size-14 place-items-center rounded-full border border-ink-100/8 bg-ink-800 text-sun-400">
          <IconCheck size={30} />
        </div>
        <h1 className="font-display mt-6 text-[34px] leading-[1.08]">Now open it from your Home Screen</h1>
        <p className="mt-3 max-w-xs text-[16px] leading-relaxed text-ink-300">Close the browser and tap Saved Feed on your Home Screen. Import your saves there, not here.</p>
        <Button variant="ghost" className="mt-8" onClick={onDone}>
          Keep using it in the browser
        </Button>
      </div>
    )
  }

  return (
    <div className="pt-safe pb-safe flex h-full flex-col bg-ink-950">
      <div className="mx-auto flex w-full max-w-md items-center justify-between px-5 pt-3">
        <Logo size={28} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-md flex-col px-5 pt-8 pb-6">
          <h1 className="font-display text-[34px] leading-[1.08]">{copy.title}</h1>
          <p className="mt-3 mb-7 text-[16px] leading-relaxed text-ink-300">{copy.body}</p>
          <InstallGuide platform={platform} />
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-md items-center justify-end gap-3 px-5 pt-4 pb-6">
        {/* In an app's built-in browser the goal is to leave, so staying is the quiet option. */}
        <Button variant={copy.done || platform === 'in-app' ? 'ghost' : 'primary'} onClick={onDone}>
          {copy.skip}
        </Button>
        {copy.done && (
          <Button variant="primary" onClick={() => setAdded(true)}>
            {copy.done}
          </Button>
        )}
      </div>
    </div>
  )
}

// ---------- small illustrations, drawn with the app's own pieces ----------
//
// Every graphic fits inside ART_MAX (168px tall, 288px wide) and sits on the
// bottom of a fixed-size stage, so each slide's title lands in the same place
// with the same gap above it. On wider screens the graphic is scaled up from
// the bottom, which keeps that gap.

function ArtStage({ children }: { children: ReactNode }) {
  return (
    <div className="mb-10 flex h-44 shrink-0 items-end justify-center sm:mb-14 sm:h-60" aria-hidden>
      <div className="flex w-full max-w-72 origin-bottom justify-center sm:scale-125">{children}</div>
    </div>
  )
}

function Card({ className = '', children }: { className?: string; children?: ReactNode }) {
  return <div className={cx('rounded-2xl border border-ink-700 bg-ink-850', className)}>{children}</div>
}

function Row({ icon, iconClass = 'bg-ink-800 text-ink-400', children, className = '' }: { icon: ReactNode; iconClass?: string; children: ReactNode; className?: string }) {
  return (
    <Card className={cx('flex items-center gap-3 px-3 py-2', className)}>
      <span className={cx('grid size-8 shrink-0 place-items-center rounded-full', iconClass)}>{icon}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </Card>
  )
}

function ArtStack() {
  return (
    <div className="relative mb-1.5 h-[152px] w-28">
      <Card className="absolute inset-0 translate-x-5 rotate-6 opacity-50" />
      <Card className="absolute inset-0 -translate-x-5 -rotate-6 opacity-70" />
      <Card className="absolute inset-0 grid place-items-center bg-gradient-to-b from-ink-800 to-ink-850">
        <Logo size={40} />
      </Card>
    </div>
  )
}

function ArtSteps() {
  const steps = [
    { icon: <IconUpload size={18} />, label: 'Download your Instagram data' },
    { icon: <span className="font-mono text-[10px]">.zip</span>, label: 'Drop the file in' },
    { icon: <IconTag size={18} />, label: 'Collections → categories' },
  ]
  return (
    <div className="flex w-full flex-col gap-2">
      {steps.map((s) => (
        <Row key={s.label} icon={s.icon}>
          <span className="block truncate text-[13px] font-medium text-ink-100">{s.label}</span>
        </Row>
      ))}
    </div>
  )
}

/** A small copy of the Today masthead (today's real date), then the day's sections. */
function ArtCategories() {
  const rows = [
    { name: 'All saved', n: 158, hue: null },
    { name: 'Recipes', n: 41, hue: 20 },
    { name: 'Travel', n: 27, hue: 190 },
  ]
  return (
    <Card className="w-full px-4 pt-3 pb-1">
      <p className="font-mono text-[10px] text-ink-500">{new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(new Date())}</p>
      <p className="font-display text-[24px] leading-tight">{new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' }).format(new Date())}</p>
      <ul className="mt-2 border-t border-ink-100/15">
        {rows.map((r) => (
          <li key={r.name} className="flex h-8 items-center gap-3 border-b border-ink-100/8 text-[13px] last:border-b-0">
            <span className="grid size-4 place-items-center">
              {r.hue === null ? <IconShuffle size={14} className="text-sun-400" /> : <span className="size-1.5 rounded-full" style={{ background: categoryColor(r.hue) }} />}
            </span>
            <span className="flex-1">{r.name}</span>
            <span className="font-mono text-[11px] text-ink-500">{r.n}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function ArtPhone() {
  return (
    <div className="relative h-[168px] w-24 overflow-hidden rounded-[18px] border-2 border-ink-700 bg-gradient-to-b from-ink-700 via-ink-800 to-ink-900">
      <span className="absolute top-[42%] left-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white">
        <IconPlay size={16} />
      </span>
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-2 pt-6 pb-2 text-white">
        <span className="min-w-0 flex-1 truncate text-[9px] font-medium">@you</span>
        <IconTag size={11} className="shrink-0" />
        <IconExternal size={11} className="shrink-0" />
        <IconFlag size={11} className="shrink-0" />
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
    <div className="flex w-full flex-col gap-2">
      {rows.map((r) => (
        <Row key={r.label} icon={<IconFlag size={16} />} iconClass="bg-ink-800 text-ink-400">
          <span className="block truncate text-[13px] font-medium text-ink-100 line-through decoration-ink-500">{r.label}</span>
          <span className="block truncate text-xs text-ink-500">{r.note}</span>
        </Row>
      ))}
    </div>
  )
}

function ArtPrivate() {
  return (
    <div className="relative grid size-40 place-items-center">
      <div className="absolute inset-0 rounded-full border border-dashed border-ink-700" />
      <div className="absolute inset-5 rounded-full border border-ink-800 bg-ink-900" />
      <div className="relative flex flex-col items-center gap-1.5">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="text-sun-400" aria-hidden="true">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        <span className="text-[11px] font-medium text-ink-300">On this device</span>
      </div>
    </div>
  )
}
