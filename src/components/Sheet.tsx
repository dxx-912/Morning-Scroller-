import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconClose } from './icons'

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  /** Footer pinned to the bottom of the sheet (e.g. action buttons). */
  footer?: ReactNode
  /** Let the sheet grow to nearly full height. */
  tall?: boolean
}

/** Bottom sheet on phones, centered card on larger screens. */
export function Sheet({ open, onClose, title, children, footer, tall }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      prev?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="presentation">
      <div className="absolute inset-0 animate-fade-in bg-black/60" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={`relative flex w-full animate-sheet-in flex-col rounded-t-[20px] border border-ink-100/8 bg-ink-850 shadow-[0_-8px_32px_rgba(0,0,0,0.4)] outline-none sm:max-w-md sm:animate-pop sm:rounded-[20px] ${
          tall ? 'max-h-[92dvh]' : 'max-h-[80dvh]'
        }`}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-ink-600 sm:hidden" />
        {title !== undefined && (
          <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-2 sm:pt-5">
            <h2 className="text-[17px] font-medium">{title}</h2>
            <button onClick={onClose} className="-mr-2 rounded-lg p-2 text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-100" aria-label="Close">
              <IconClose size={20} />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-ink-100/8 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
        {!footer && <div className="pb-[env(safe-area-inset-bottom)]" />}
      </div>
    </div>,
    document.body,
  )
}

interface ConfirmProps {
  open: boolean
  title: string
  body?: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmSheet({ open, title, body, confirmLabel, danger, onConfirm, onClose }: ConfirmProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            className="flex-1"
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {body && <div className="text-[15px] leading-relaxed text-ink-400">{body}</div>}
    </Sheet>
  )
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'md' | 'sm'
}

export function Button({ variant = 'secondary', size = 'md', className = '', ...rest }: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-[10px] font-medium transition-[background-color,color,transform,opacity] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40'
  const sizes = { md: 'h-11 px-5 text-[15px]', sm: 'h-9 px-4 text-sm' }
  // Primary is the off-white from the ramp; the amber accent is kept for selection and progress.
  const variants = {
    primary: 'bg-ink-100 text-ink-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] hover:bg-white',
    secondary: 'border border-ink-100/8 bg-ink-800 text-ink-100 hover:bg-ink-700',
    ghost: 'text-ink-300 hover:bg-ink-800 hover:text-ink-100',
    danger: 'bg-danger/12 text-danger hover:bg-danger/20',
  }
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest} />
}
