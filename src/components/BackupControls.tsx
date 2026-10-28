import { useRef, useState, type ReactNode } from 'react'
import { readBackup } from '../lib/library'
import type { LibrarySnapshot } from '../lib/types'
import { plural } from '../lib/util'
import { useLibrary } from '../state/LibraryContext'
import { Button, Sheet } from './Sheet'
import { useToast } from './Toast'

function backupFile(json: string): File {
  const date = new Date().toISOString().slice(0, 10)
  return new File([json], `saved-feed-backup-${date}.json`, { type: 'application/json' })
}

/** Download (and, where supported, share) a JSON backup of the whole library. */
export function BackupExportButtons() {
  const { exportBackup, posts } = useLibrary()
  const toast = useToast()
  const canShare = typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [backupFile('{}')] })

  const download = () => {
    const file = backupFile(JSON.stringify(exportBackup(), null, 1))
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    toast('Backup downloaded')
  }

  const share = async () => {
    try {
      await navigator.share({ files: [backupFile(JSON.stringify(exportBackup()))], title: 'Saved Feed backup' })
    } catch {
      /* cancelled */
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={download} disabled={posts.length === 0}>
        Download backup
      </Button>
      {canShare && (
        <Button variant="ghost" onClick={share} disabled={posts.length === 0}>
          Share…
        </Button>
      )}
    </div>
  )
}

/** Pick a backup file; asks whether to merge or replace when the library isn't empty. */
export function BackupImportButton({ children, className }: { children: ReactNode; className?: string }) {
  const { posts, importBackup } = useLibrary()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<LibrarySnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  const apply = async (lib: LibrarySnapshot, mode: 'merge' | 'replace') => {
    await importBackup(lib, mode)
    setPending(null)
    toast(`Restored ${plural(lib.posts.length, 'post')}`)
  }

  const onFile = async (file?: File) => {
    if (!file) return
    try {
      const lib = readBackup(JSON.parse(await file.text()))
      if (posts.length === 0) await apply(lib, 'replace')
      else setPending(lib)
    } catch (e) {
      setError(e instanceof SyntaxError ? "That file isn't valid JSON." : (e as Error).message)
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => input.current?.click()}>
        {children}
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <Sheet
        open={!!pending}
        onClose={() => setPending(null)}
        title="Restore backup"
        footer={
          <div className="flex flex-col gap-2">
            <Button variant="primary" onClick={() => pending && apply(pending, 'merge')}>
              Merge with my library
            </Button>
            <Button variant="danger" onClick={() => pending && apply(pending, 'replace')}>
              Replace my library
            </Button>
          </div>
        }
      >
        <p className="text-[15px] leading-relaxed text-ink-300">
          The backup has {plural(pending?.posts.length ?? 0, 'post')} and {plural(pending?.categories.length ?? 0, 'category', 'categories')}. You already have{' '}
          {plural(posts.length, 'post')} here.
        </p>
        <p className="mt-3 text-sm text-ink-400">Merge keeps everything and combines categories. Replace deletes this device's library first.</p>
      </Sheet>
      <Sheet open={!!error} onClose={() => setError(null)} title="Couldn't restore">
        <p className="text-[15px] text-ink-300">{error}</p>
      </Sheet>
    </>
  )
}
