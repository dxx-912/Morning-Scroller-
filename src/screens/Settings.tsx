import { useEffect, useState, type ReactNode } from 'react'
import { BackupExportButtons, BackupImportButton } from '../components/BackupControls'
import { ExportHowTo, ImportPanel } from '../components/ImportPanel'
import { IconExternal, IconRestore, IconTrash, Logo } from '../components/icons'
import { Button, ConfirmSheet } from '../components/Sheet'
import { useToast } from '../components/Toast'
import { formatDate, plural } from '../lib/util'
import { checkLogin, clearVideoCache, REFRESH_URL, VIDEO_LOOKUPS, type LoginStatus } from '../lib/video'
import { useLibrary } from '../state/LibraryContext'
import { InstallGuide } from '../components/InstallGuide'
import { detectPlatform } from '../lib/platform'
import { useOnboarding } from '../state/onboarding'
import { useSettings } from '../state/settings'

export function Settings() {
  const { posts, categories, setStatus, deletePosts, resetAll } = useLibrary()
  const [settings, update] = useSettings()
  const { replayIntro } = useOnboarding()
  const toast = useToast()
  const [confirmPurge, setConfirmPurge] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [persisted, setPersisted] = useState<boolean | null>(null)

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(null))
  }, [])

  const dead = posts.filter((p) => p.status === 'unavailable').sort((a, b) => (b.statusAt ?? 0) - (a.statusAt ?? 0))

  return (
    <div className="pt-safe h-full overflow-y-auto">
      <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 pt-4 pb-12">
        <h1 className="font-display order-first text-[32px] leading-none">Settings</h1>

        <Section title="Import from Instagram" hint="Re-importing is safe: new saves are added and your categories are kept.">
          <ImportPanel />
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-medium text-ink-300">How to get your export</summary>
            <div className="mt-3">
              <ExportHowTo />
            </div>
          </details>
        </Section>

        <Section
          id="unavailable"
          className={dead.length ? 'order-first' : undefined}
          title={`Unavailable posts${dead.length ? ` (${dead.length})` : ''}`}
          hint="Posts that are deleted or private, reels that only play on Instagram, and posts you flagged. They're skipped in the feed."
        >
          {dead.length === 0 ? (
            <p className="text-sm text-ink-500">None. Every post has loaded fine so far.</p>
          ) : (
            <>
              <ul className="-mx-1 max-h-80 divide-y divide-ink-100/8 overflow-y-auto">
                {dead.map((p) => (
                  <li key={p.shortcode} className="flex items-center gap-1 px-1 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{p.author ? `@${p.author}` : p.shortcode}</p>
                      <p className="text-xs text-ink-500">
                        {p.unavailableReason === 'watch-only' ? 'Only plays on Instagram' : `${p.kind} · saved ${formatDate(p.savedAt)}`}
                      </p>
                    </div>
                    <a href={p.url} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-800 hover:text-ink-100" aria-label="Open in Instagram">
                      <IconExternal size={18} />
                    </a>
                    <button onClick={() => setStatus(p.shortcode, 'unknown')} className="rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-800 hover:text-ink-100" aria-label="Restore to feed" title="Restore to feed">
                      <IconRestore size={18} />
                    </button>
                    <button onClick={() => deletePosts([p.shortcode])} className="rounded-lg p-2 text-ink-500 transition-colors hover:bg-danger/12 hover:text-danger" aria-label="Remove" title="Remove">
                      <IconTrash size={18} />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="danger" size="sm" onClick={() => setConfirmPurge(true)}>
                  Remove all {dead.length}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // Watch-only reels load fine; re-checking can't tell, so leave them.
                    const recheck = dead.filter((p) => p.unavailableReason !== 'watch-only')
                    recheck.forEach((p) => setStatus(p.shortcode, 'unknown'))
                    toast(`${plural(recheck.length, 'post')} will be re-checked in the feed`)
                  }}
                >
                  Re-check all
                </Button>
              </div>
            </>
          )}
        </Section>

        <Section title="Backup & move to another device" hint="A single JSON file with your posts, categories and dead-link flags. Import it on your phone to pick up where you left off.">
          <div className="flex flex-col gap-3">
            <BackupExportButtons />
            <BackupImportButton className="self-start text-sm font-medium text-ink-300 underline decoration-ink-600 underline-offset-4 transition-colors hover:text-ink-100">Restore from a backup file…</BackupImportButton>
          </div>
        </Section>

        {VIDEO_LOOKUPS && <VideoLogin reels={posts.filter((p) => p.kind !== 'post' && p.status !== 'unavailable').map((p) => p.shortcode)} />}

        <Section title="Display">
          <Toggle
            label="Show captions"
            hint="Shows Instagram's whole embed with the caption, instead of just the photo or video. Posts get taller and are scaled down to fit."
            checked={settings.captions}
            onChange={(v) => update({ captions: v })}
          />
        </Section>

        <Section title="Storage">
          <p className="text-sm text-ink-400">
            {plural(posts.length, 'post')} and {plural(categories.length, 'category', 'categories')} stored in this browser (IndexedDB).{' '}
            {persisted === true && 'Protected from automatic cleanup.'}
            {persisted === false && 'The browser may clear it under storage pressure, so keep a backup. Installing the app to your home screen helps.'}
          </p>
          <Button variant="danger" size="sm" className="mt-3" onClick={() => setConfirmReset(true)} disabled={posts.length === 0 && categories.length === 0}>
            Erase everything on this device
          </Button>
        </Section>

        {detectPlatform() !== 'installed' && (
          <Section title="Add to Home Screen" hint="Opens full-screen, like an app.">
            <InstallGuide />
          </Section>
        )}

        <Section title="How Saved Feed works">
          <Button size="sm" onClick={replayIntro}>
            Show the intro again
          </Button>
        </Section>

        <div className="mt-8 flex flex-col items-center gap-3 text-center text-xs text-ink-500">
          <Logo size={20} />
          <p className="leading-relaxed">
            Saved Feed <span className="font-mono">{__APP_VERSION__}</span> · beta
            <br />
            Not affiliated with Instagram or Meta.
          </p>
        </div>
      </div>

      <ConfirmSheet
        open={confirmPurge}
        onClose={() => setConfirmPurge(false)}
        title={`Remove ${plural(dead.length, 'unavailable post')}?`}
        body="They'll be deleted from Saved Feed. Your saves on Instagram aren't affected."
        confirmLabel="Remove"
        danger
        onConfirm={() => {
          deletePosts(dead.map((p) => p.shortcode))
          toast(`Removed ${plural(dead.length, 'post')}`)
        }}
      />
      <ConfirmSheet
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Erase everything?"
        body="This deletes every post, category and setting from this device. Download a backup first if you want to keep them."
        confirmLabel="Erase"
        danger
        onConfirm={() => {
          resetAll()
          toast('Library erased')
        }}
      />
    </div>
  )
}

const STATUS_TEXT: Record<LoginStatus, string> = {
  ok: 'Working. Reels play in the app.',
  'login-expired': 'The Instagram login expired, so reels show as embeds.',
  'no-login': 'No Instagram login is set up, so reels show as embeds.',
  'no-ytdlp': "yt-dlp isn't installed on the video server.",
  'no-server': "There's no video server here, so reels always use embeds.",
  unknown: "Couldn't tell. Instagram didn't answer clearly. Try again in a minute.",
}

const FIX_HINT = import.meta.env.DEV
  ? 'Export a fresh cookies.txt from the spare account, save it as .secrets/ig-cookies.txt, then check again.'
  : 'Replace the cookies file on the video server, then check again.'

/** Checks whether reels can play in the app, and links to the login refresh page. */
function VideoLogin({ reels }: { reels: string[] }) {
  const [status, setStatus] = useState<LoginStatus | null>(null)
  const [checking, setChecking] = useState(false)

  const check = async () => {
    setChecking(true)
    const result = await checkLogin(reels)
    if (result === 'ok') clearVideoCache()
    setStatus(result)
    setChecking(false)
  }

  const broken = status === 'login-expired' || status === 'no-login'

  return (
    <Section id="videos" title="Videos" hint="Reels play in the app while the spare account's Instagram login works. When it expires, they fall back to embeds.">
      {status && (
        <p className={`mb-3 text-sm ${status === 'ok' ? 'text-ink-300' : 'text-sun-400'}`}>
          {STATUS_TEXT[status]}
          {broken && !REFRESH_URL && <span className="mt-1 block text-ink-400">{FIX_HINT}</span>}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={check} disabled={checking || reels.length === 0}>
          {checking ? 'Checking…' : 'Check videos'}
        </Button>
        {REFRESH_URL && (
          <a
            href={REFRESH_URL}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex h-9 items-center gap-2 rounded-[10px] px-4 text-sm font-medium transition-[background-color,color,transform] active:scale-[0.97] ${
              broken ? 'bg-ink-100 text-ink-950 hover:bg-white' : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100'
            }`}
          >
            Refresh login <IconExternal size={16} />
          </a>
        )}
      </div>
      {reels.length === 0 && <p className="mt-2 text-xs text-ink-500">Import some reels first to check.</p>}
    </Section>
  )
}

function Section({ title, hint, children, id, className = '' }: { title: string; hint?: string; children: ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={`rounded-2xl border border-ink-100/8 bg-ink-900 p-5 ${className}`}>
      <h2 className="text-base font-medium">{title}</h2>
      {hint && <p className="mt-1 text-sm leading-relaxed text-ink-400">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-4">
      <span className="flex-1">
        <span className="block text-[15px]">{label}</span>
        {hint && <span className="mt-1 block text-sm leading-relaxed text-ink-400">{hint}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative mt-0.5 h-7 w-12 shrink-0 rounded-full bg-ink-700 transition-colors peer-checked:bg-sun-400 peer-focus-visible:ring-2 peer-focus-visible:ring-sun-400 after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-ink-100 after:transition-transform peer-checked:after:translate-x-5" />
    </label>
  )
}
