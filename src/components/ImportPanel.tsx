import { useRef, useState } from 'react'
import { readExportFiles } from '../lib/exportFiles'
import type { ImportStats } from '../lib/library'
import { parseInstagramExport } from '../lib/parser'
import type { ParseResult } from '../lib/types'
import { cx, plural } from '../lib/util'
import { useLibrary } from '../state/LibraryContext'
import { Button } from './Sheet'
import { IconCheck, IconUpload } from './icons'

type Phase =
  | { step: 'idle'; error?: string }
  | { step: 'reading' }
  | { step: 'preview'; result: ParseResult }
  | { step: 'saving' }
  | { step: 'done'; stats: ImportStats }

/** Pick or drop an Instagram export, preview what was found, then import. */
export function ImportPanel({ onDone }: { onDone?: (stats: ImportStats) => void }) {
  const { importInstagram } = useLibrary()
  const [phase, setPhase] = useState<Phase>({ step: 'idle' })
  const [dragging, setDragging] = useState(false)
  const filesInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)

  const handle = async (list: FileList | File[] | null) => {
    const files = list ? [...list] : []
    if (files.length === 0) return
    setPhase({ step: 'reading' })
    try {
      const exportFiles = await readExportFiles(files)
      if (exportFiles.length === 0) {
        setPhase({ step: 'idle', error: "Couldn't find saved_posts.json or saved_collections.json in what you picked." })
        return
      }
      setPhase({ step: 'preview', result: parseInstagramExport(exportFiles) })
    } catch (err) {
      setPhase({ step: 'idle', error: `Couldn't read those files (${(err as Error).message}).` })
    }
  }

  const confirm = async (result: ParseResult) => {
    setPhase({ step: 'saving' })
    const stats = await importInstagram(result)
    setPhase({ step: 'done', stats })
    onDone?.(stats)
  }

  if (phase.step === 'preview') {
    const { posts, collections, report } = phase.result
    return (
      <div className="flex animate-fade-in flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          <Stat n={posts.length} label="posts found" highlight />
          <Stat n={report.byKind.reel} label="reels" />
          <Stat n={collections.length} label="collections" />
        </div>
        {collections.length > 0 && (
          <div>
            <p className="mb-2 text-sm text-ink-400">Collections become categories</p>
            <div className="flex flex-wrap gap-2">
              {collections.map((c) => (
                <span key={c.name} className="flex h-8 items-center gap-1.5 rounded-full border border-ink-100/8 bg-ink-800 px-3 text-sm">
                  {c.name} <span className="font-mono text-xs text-ink-500 tabular-nums">{c.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}
        <ul className="space-y-1 text-sm text-ink-400">
          <li>
            Read {report.files.map((f) => f.name).join(' and ')}
          </li>
          {report.duplicates > 0 && <li>{plural(report.duplicates, 'duplicate')} merged</li>}
          {report.skipped > 0 && <li>{plural(report.skipped, 'entry', 'entries')} without a post link skipped</li>}
          {report.warnings.map((w) => (
            <li key={w} className="text-sun-400">
              {w}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setPhase({ step: 'idle' })}>
            Back
          </Button>
          <Button variant="primary" className="flex-1" disabled={posts.length === 0} onClick={() => confirm(phase.result)}>
            Import {plural(posts.length, 'post')}
          </Button>
        </div>
      </div>
    )
  }

  if (phase.step === 'done') {
    const { stats } = phase
    return (
      <div className="flex animate-pop flex-col items-center gap-2 py-4 text-center">
        <div className="grid size-12 place-items-center rounded-full bg-ok/12 text-ok">
          <IconCheck />
        </div>
        <p className="font-medium">Imported</p>
        <p className="text-sm text-ink-400">
          {plural(stats.added, 'new post')}
          {stats.updated > 0 && `, ${stats.updated} updated`}
          {stats.newCategories.length > 0 && `, ${plural(stats.newCategories.length, 'new category', 'new categories')}`}
          {stats.unchanged > 0 && `. ${stats.unchanged} already in your library`}.
        </p>
        <Button variant="ghost" size="sm" onClick={() => setPhase({ step: 'idle' })}>
          Import another
        </Button>
      </div>
    )
  }

  const busy = phase.step === 'reading' || phase.step === 'saving'
  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handle(e.dataTransfer.files)
        }}
        className={cx(
          'flex flex-col items-center gap-4 rounded-2xl border border-dashed px-6 py-8 text-center transition-colors',
          dragging ? 'border-sun-400 bg-sun-400/5' : 'border-ink-600',
        )}
      >
        <div className={cx('grid size-12 place-items-center rounded-full bg-ink-800 text-ink-400', busy && 'animate-pulse')}>
          <IconUpload />
        </div>
        <div>
          <p className="font-medium">{busy ? 'Reading your export…' : 'Drop your Instagram export'}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-400">The .zip, the unzipped folder, or saved_posts.json + saved_collections.json</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" disabled={busy} onClick={() => filesInput.current?.click()}>
            Choose files
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => folderInput.current?.click()} className="max-sm:hidden">
            Choose folder
          </Button>
        </div>
        <input
          ref={filesInput}
          type="file"
          multiple
          accept=".json,.zip,application/json,application/zip"
          className="hidden"
          onChange={(e) => {
            handle(e.target.files)
            e.target.value = ''
          }}
        />
        <input
          ref={folderInput}
          type="file"
          // @ts-expect-error: non-standard but supported in all major browsers
          webkitdirectory=""
          className="hidden"
          onChange={(e) => {
            handle(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      {phase.step === 'idle' && phase.error && <p className="text-center text-sm text-danger">{phase.error}</p>}
    </div>
  )
}

function Stat({ n, label, highlight }: { n: number; label: string; highlight?: boolean }) {
  return (
    <div className={cx('rounded-xl border px-3 py-3 text-center', highlight ? 'border-sun-400/40 bg-ink-800' : 'border-ink-100/8 bg-ink-900')}>
      <p className="font-mono text-2xl leading-8 tabular-nums">{n.toLocaleString()}</p>
      <p className="text-xs text-ink-400">{label}</p>
    </div>
  )
}

export function ExportHowTo() {
  return (
    <ol className="space-y-2.5 text-sm text-ink-300">
      {[
        'In Instagram, open Settings → Accounts Center → Your information and permissions → Download your information.',
        'Choose "Some of your information", then tick Saved (under Your Instagram activity).',
        'Pick Format: JSON (not HTML). Any date range and media quality is fine.',
        'When the email arrives, download the .zip and drop it here. Media files inside are ignored.',
      ].map((t, i) => (
        <li key={i} className="flex gap-3">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink-800 font-mono text-xs text-ink-400">{i + 1}</span>
          <span className="pt-0.5">{t}</span>
        </li>
      ))}
    </ol>
  )
}
