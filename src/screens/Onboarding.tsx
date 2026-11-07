import { useState } from 'react'
import { BackupImportButton } from '../components/BackupControls'
import { ExportHowTo, ImportPanel } from '../components/ImportPanel'
import { IconChevronDown, Logo } from '../components/icons'

export function Onboarding() {
  const [howTo, setHowTo] = useState(false)
  return (
    <div className="pt-safe h-full overflow-y-auto">
      <div className="mx-auto flex max-w-md flex-col px-5 pt-12 pb-12">
        <Logo size={52} />
        <h1 className="font-display mt-6 text-[32px] leading-[1.1] font-bold tracking-tight">
          Bring in your <span className="text-sunrise">saves</span>
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-ink-300">
          Drop in your Instagram data download. Saved Feed only reads your saved posts and collections; photos and messages in the file are ignored.
        </p>
        <p className="mt-2 text-sm text-ink-500">It stays on this device. No account, no server.</p>

        <div className="mt-8">
          <ImportPanel />
        </div>

        <button onClick={() => setHowTo((v) => !v)} className="mt-6 flex items-center gap-1.5 self-start text-sm font-semibold text-ink-300 hover:text-ink-100" aria-expanded={howTo}>
          How do I get my export?
          <IconChevronDown size={16} className={howTo ? 'rotate-180 transition' : 'transition'} />
        </button>
        {howTo && (
          <div className="mt-4 animate-fade-in">
            <ExportHowTo />
          </div>
        )}

        <div className="mt-8 border-t border-ink-800 pt-6 text-sm text-ink-400">
          Moving from another device? <BackupImportButton className="font-semibold text-sun-400 hover:underline">Restore a Saved Feed backup</BackupImportButton>
        </div>
      </div>
    </div>
  )
}
