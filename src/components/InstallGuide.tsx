import { useMemo, type ReactNode } from 'react'
import { renderSVG } from 'uqr'
import { detectPlatform, useInstallPrompt, type Platform } from '../lib/platform'
import { cx } from '../lib/util'
import { Logo } from './icons'
import { Button } from './Sheet'

/**
 * Step-by-step "add to Home Screen" instructions for the browser this page is
 * open in, with little copies of the exact buttons to press. Used at the end
 * of the intro and in Settings.
 *
 * iPhone steps checked against iOS 26 Safari (Nov 2026): the default layout
 * puts Share inside the ••• menu next to the address bar; the Top/Bottom tab
 * layouts show a Share button directly.
 */

export function InstallGuide({ platform = detectPlatform() }: { platform?: Platform }) {
  const steps = STEPS[platform]
  return (
    <div className="flex flex-col gap-4">
      {platform === 'desktop' && <OpenOnPhone />}
      {platform === 'android' && <AndroidOneTap />}
      {steps.length > 0 && (
        <ol className="flex flex-col gap-3.5">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink-800 text-xs font-bold text-sun-400">{i + 1}</span>
              <div className="min-w-0 pt-0.5 text-[15px] leading-relaxed text-ink-100">
                {s.text}
                {s.note && <p className="mt-1 text-[13px] leading-snug text-ink-500">{s.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
      {(platform === 'ios-safari' || platform === 'ios-other' || platform === 'in-app') && (
        <p className="rounded-2xl border border-sun-500/30 bg-sun-500/10 px-4 py-3 text-[13px] leading-snug text-sun-300">
          Do this before importing your saves. On iPhone, the Home Screen app keeps its own library, separate from {platform === 'ios-safari' ? 'Safari' : 'this browser'}. Already imported here? Download a backup in Settings first, then restore it in the Home Screen app.
        </p>
      )}
    </div>
  )
}

// ---------- the exact buttons, drawn small ----------

/** A small copy of a browser button, shown inline in the instructions. */
function Key({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx('mx-0.5 inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-2 align-middle text-[13px] font-semibold text-white', className)}>
      {children}
    </span>
  )
}

const svg = (children: ReactNode, size = 16) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

/** iOS's Share icon: a box with an arrow out of the top. */
const ShareIcon = () =>
  svg(
    <>
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H16" />
    </>,
  )
const PlusBoxIcon = () =>
  svg(
    <>
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <path d="M12 8.5v7M8.5 12h7" />
    </>,
  )
const DotsKey = () => (
  <Key className="px-2.5 tracking-[0.2em]">
    •••
  </Key>
)
const VDotsKey = () => <Key className="w-7 justify-center px-0">⋮</Key>
const ShareKey = ({ label = false }: { label?: boolean }) => (
  <Key>
    <span className="text-[#0a84ff]">
      <ShareIcon />
    </span>
    {label && 'Share'}
  </Key>
)
const AddToHomeKey = ({ label = 'Add to Home Screen' }: { label?: string }) => (
  <Key>
    {label}
    <PlusBoxIcon />
  </Key>
)
const Toggle = () => (
  <Key>
    Open as Web App
    <span className="relative inline-block h-4 w-7 rounded-full bg-[#34c759]">
      <span className="absolute top-0.5 right-0.5 size-3 rounded-full bg-white" />
    </span>
  </Key>
)
// Inline color: Key's own text-white would otherwise win.
const BlueKey = ({ children }: { children: ReactNode }) => (
  <Key>
    <span style={{ color: '#0a84ff' }}>{children}</span>
  </Key>
)
const AppIcon = () => (
  <Key className="px-1.5">
    <span className="grid size-5 place-items-center rounded-md bg-ink-950">
      <Logo size={13} />
    </span>
    Saved Feed
  </Key>
)

interface Step {
  text: ReactNode
  note?: ReactNode
}

const OPEN_IT: Step = {
  text: (
    <>
      Close Safari and tap <AppIcon /> on your Home Screen. Import your saves there.
    </>
  ),
}

const STEPS: Record<Platform, Step[]> = {
  'ios-safari': [
    {
      text: (
        <>
          Tap <DotsKey /> next to the address bar.
        </>
      ),
      note: (
        <>
          See <ShareKey /> instead? Tap that and skip to step 3.
        </>
      ),
    },
    {
      text: (
        <>
          Tap <ShareKey label />
        </>
      ),
    },
    {
      text: (
        <>
          Scroll down and tap <AddToHomeKey />
        </>
      ),
      note: 'Not in the list? Tap Edit Actions at the bottom and add it.',
    },
    {
      text: (
        <>
          Leave <Toggle /> on, then tap <BlueKey>Add</BlueKey> at the top right.
        </>
      ),
    },
    OPEN_IT,
  ],
  'ios-other': [
    {
      text: (
        <>
          Tap <ShareKey /> in the address bar.
        </>
      ),
      note: "Can't find it? Look in the ••• or ≡ menu.",
    },
    {
      text: (
        <>
          Tap <AddToHomeKey />
        </>
      ),
      note: 'You may need to tap More or scroll to see it.',
    },
    {
      text: (
        <>
          Tap <BlueKey>Add</BlueKey>
        </>
      ),
    },
    {
      text: (
        <>
          Tap <AppIcon /> on your Home Screen and import your saves there.
        </>
      ),
    },
  ],
  'in-app': [
    {
      text: (
        <>
          You're in an app's built-in browser, which can't add to the Home Screen. Tap <DotsKey /> at the top right.
        </>
      ),
    },
    {
      text: (
        <>
          Tap <Key>Open in external browser</Key>
        </>
      ),
      note: 'It may say Open in Safari or Open in Chrome.',
    },
    { text: 'This page opens there with the steps for that browser.' },
  ],
  android: [
    {
      text: (
        <>
          Tap <VDotsKey /> at the top right of Chrome.
        </>
      ),
    },
    {
      text: (
        <>
          Tap <AddToHomeKey label="Add to Home screen" />
        </>
      ),
      note: 'It may say Install app instead.',
    },
    {
      text: (
        <>
          Tap <BlueKey>Install</BlueKey>, then open <AppIcon /> from your home screen.
        </>
      ),
    },
  ],
  desktop: [],
  installed: [],
}

// ---------- platform extras ----------

function AndroidOneTap() {
  const { state, install } = useInstallPrompt()
  if (state === 'unavailable') return null
  if (state === 'installed') return <p className="text-[15px] text-ink-100">Installed. Open Saved Feed from your home screen.</p>
  return (
    <div className="flex flex-col gap-2">
      <Button variant="primary" onClick={() => void install()}>
        Install Saved Feed
      </Button>
      <p className="text-center text-xs text-ink-500">Or do it by hand:</p>
    </div>
  )
}

function OpenOnPhone() {
  const url = typeof location !== 'undefined' ? location.origin : ''
  const qr = useMemo(() => renderSVG(url, { border: 1, pixelSize: 6, whiteColor: '#ffffff', blackColor: '#0b0b0d' }), [url])
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <div className="size-28 shrink-0 overflow-hidden rounded-xl bg-white p-1 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} role="img" aria-label={`QR code for ${url}`} />
      <div className="min-w-0 text-[15px] leading-relaxed text-ink-100">
        Scan this with your phone's camera, then follow the steps there.
        <p className="mt-1 truncate text-[13px] text-ink-500">{url.replace(/^https?:\/\//, '')}</p>
      </div>
    </div>
  )
}
