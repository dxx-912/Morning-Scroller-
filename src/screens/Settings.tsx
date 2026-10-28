import { useEffect, useState, type ReactNode } from 'react'
import { BackupExportButtons, BackupImportButton } from '../components/BackupControls'
import { ExportHowTo, ImportPanel } from '../components/ImportPanel'
import { IconExternal, IconRestore, IconTrash, Logo } from '../components/icons'
import { Button, ConfirmSheet } from '../components/Sheet'
import { useToast } from '../components/Toast'
import { formatDate, plural } from '../lib/util'
import { useLibrary } from '../state/LibraryContext'
import { useSettings } from '../state/settings'

export function Settings() {
  const { posts, categories, setStatus, deletePosts, resetAll } = useLibrary()
  const [settings, update] = useSettings()
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
        <h1 className="font-display order-first text-2xl font-bold tracking-tight">Settings</h1>

        <Section title="Import from Instagram" hint="Re-importing is safe: new saves are added and your categories are kept.">
          <ImportPanel />
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-semibold text-ink-300">How to get your export</summary>
            <div className="mt-3">
              <ExportHowTo />
            </div>
          </details>
        </Section>

        <Section
          id="unavailable"
          className={dead.length ? 'order-first' : undefined}
          title={`Unavailable posts${dead.length ? ` (${dead.length})` : ''}`}
          hint="Posts whose embed failed to load (deleted or private) or that you flagged. They're skipped in the feed."
        >
          {dead.length === 0 ? (
            <p className="text-sm text-ink-500">None. Every post has loaded fine so far.</p>
          ) : (
            <>
              <ul className="-mx-1 max-h-80 divide-y divide-ink-800 overflow-y-auto">
                {dead.map((p) => (
                  <li key={p.shortcode} className="flex items-center gap-2 px-1 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.author ? `@${p.author}` : p.shortcode}</p>
                      <p className="text-xs text-ink-500">
                        {p.kind} · saved {formatDate(p.savedAt)}
                      </p>
                    </div>
                    <a href={p.url} target="_blank" rel="noreferrer" className="rounded-full p-2 text-ink-400 hover:bg-ink-800 hover:text-ink-100" aria-label="Open in Instagram">
                      <IconExternal size={18} />
                    </a>
                    <button onClick={() => setStatus(p.shortcode, 'unknown')} className="rounded-full p-2 text-ink-400 hover:bg-ink-800 hover:text-ink-100" aria-label="Restore to feed" title="Restore to feed">
                      <IconRestore size={18} />
                    </button>
                    <button onClick={() => deletePosts([p.shortcode])} className="rounded-full p-2 text-ink-400 hover:bg-danger/15 hover:text-danger" aria-label="Remove" title="Remove">
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
                    dead.forEach((p) => setStatus(p.shortcode, 'unknown'))
                    toast(`${plural(dead.length, 'post')} will be re-checked in the feed`)
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
            <BackupImportButton className="self-start text-sm font-semibold text-sun-400 hover:underline">Restore from a backup file…</BackupImportButton>
          </div>
        </Section>

        <Section title="Display">
          <Toggle
            label="Show captions"
            hint="Uses Instagram's captioned embed. Posts get taller and are scaled down to fit."
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

        <div className="mt-4 flex flex-col items-center gap-2 text-center text-xs text-ink-500">
          <Logo size={24} />
          <p>
            Saved Feed {__APP_VERSION__} · beta
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

function Section({ title, hint, children, id, className = '' }: { title: string; hint?: string; children: ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={`rounded-3xl border border-ink-800 bg-ink-900 p-5 ${className}`}>
      <h2 className="text-[16px] font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-ink-400">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-4">
      <span className="flex-1">
        <span className="block text-[15px] font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-sm text-ink-400">{hint}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative mt-0.5 h-7 w-12 shrink-0 rounded-full bg-ink-700 transition peer-checked:bg-sun-500 peer-focus-visible:ring-2 peer-focus-visible:ring-sun-400 after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
    </label>
  )
}
