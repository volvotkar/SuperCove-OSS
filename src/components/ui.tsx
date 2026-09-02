import { useEffect } from 'react'
import type { ReactNode, Ref, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'

/** Circular accent-tinted task checkbox (replaces native squares). */
export function TaskCheck({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full border-2 transition-all duration-150 ${
        checked
          ? 'border-tide bg-tide text-tide-ink'
          : 'border-line-strong bg-transparent hover:border-tide hover:bg-tide-soft'
      }`}
    >
      <Check
        size={12}
        strokeWidth={3.5}
        className={`transition-all duration-150 ${checked ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}
      />
    </button>
  )
}

export function PageHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-3">
      <h1 className="min-w-0 font-display text-xl font-semibold tracking-tight">{title}</h1>
      {action}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-card border border-line bg-surface ${className}`}>{children}</div>
  )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger'
}

export function Button({ variant = 'primary', className = '', ...props }: BtnProps) {
  const styles = {
    primary: 'bg-tide text-tide-ink hover:opacity-90',
    ghost: 'border border-line-strong bg-surface text-ink hover:bg-sunken',
    danger: 'bg-neg-soft text-neg hover:opacity-90',
  }[variant]
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-field px-3.5 py-2 text-[14px] font-medium transition-all disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  )
}

export function Input({
  className = '',
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <input
      ref={ref}
      className={`w-full rounded-field border border-line bg-surface px-3 py-2 text-[14px] placeholder:text-ink-faint focus:border-tide ${className}`}
      {...props}
    />
  )
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block w-full">
      <select
        className={`w-full cursor-pointer appearance-none rounded-field border border-line bg-surface py-2 pl-3 pr-9 text-[14px] transition-colors hover:border-line-strong focus:border-tide ${className}`}
        {...props}
      />
      <ChevronDown
        size={15}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint"
      />
    </span>
  )
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1 block text-[12.5px] font-medium text-ink-muted">{children}</span>
  )
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  // Escape closes — previously the only way out was clicking the backdrop.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-black/40 backdrop-blur-[2px] md:place-items-center"
      onClick={onClose}
    >
      {/* Bottom sheet on mobile: it must cap its height and scroll internally.
          Without this, content taller than the viewport overflows off the TOP
          (the sheet is bottom-aligned) and cannot be scrolled back to. `dvh`
          so the mobile URL bar is accounted for. */}
      <div
        role="dialog"
        aria-label={title}
        className="max-h-[85dvh] w-full overflow-y-auto overscroll-contain rounded-t-2xl border border-line bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl md:max-w-md md:rounded-card md:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-full text-ink-muted hover:bg-sunken"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/**
 * Soft character counter. Stays out of the way until the text is genuinely
 * long, then warns — it never blocks typing or truncates, by design. `warn` is
 * where it appears, `limit` where it turns amber and the caller may suggest
 * turning the text into a note instead.
 */
export function CharCount({
  value,
  warn = 120,
  limit = 180,
}: {
  value: string
  warn?: number
  limit?: number
}) {
  const n = value.length
  if (n < warn) return null
  return (
    <span
      className={`tnum text-[11.5px] ${n > limit ? 'text-sunrise' : 'text-ink-faint'}`}
      aria-live="polite"
    >
      {n}/{limit}
    </span>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-card border border-dashed border-line px-6 py-10 text-center text-[13.5px] text-ink-faint">
      {children}
    </div>
  )
}
