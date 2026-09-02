import { useEffect, useRef, useState } from 'react'
import { Clock } from 'lucide-react'

/**
 * Cross-browser time picker (5-minute steps). Native <input type=time> has no
 * dropdown on Firefox, so this is a custom popover: AM/PM toggle + scrollable
 * hour and minute columns. Value is minutes-of-day (0–1439) or null.
 */

const HOURS = Array.from({ length: 12 }, (_, i) => (i === 0 ? 12 : i)) // 12,1..11
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5) // 0,5,..,55

function toParts(min: number) {
  const h24 = Math.floor(min / 60)
  const m = min % 60
  const ampm: 'am' | 'pm' = h24 < 12 ? 'am' : 'pm'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return { h12, m, ampm }
}

function toMinutes(h12: number, m: number, ampm: 'am' | 'pm'): number {
  let h24 = h12 % 12
  if (ampm === 'pm') h24 += 12
  return h24 * 60 + m
}

export function formatTime(min: number): string {
  const { h12, m, ampm } = toParts(min)
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

export function TimePicker({
  value,
  onChange,
  placeholder = 'Pick time',
}: {
  value: number | null
  onChange: (min: number) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const parts = value === null ? null : toParts(value)

  function set(next: { h12?: number; m?: number; ampm?: 'am' | 'pm' }) {
    const base = parts ?? { h12: 9, m: 0, ampm: 'am' as const }
    onChange(toMinutes(next.h12 ?? base.h12, next.m ?? base.m, next.ampm ?? base.ampm))
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 rounded-field border px-3 py-2 text-[14px] transition-colors ${
          open ? 'border-tide' : 'border-line hover:border-line-strong'
        } ${value === null ? 'text-ink-faint' : ''}`}
      >
        <span className="tnum">{value === null ? placeholder : formatTime(value)}</span>
        <Clock size={15} className="shrink-0 text-ink-faint" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-[188px] rounded-field border border-line bg-surface p-2 shadow-lg">
          <div className="mb-2 flex rounded-field border border-line p-0.5">
            {(['am', 'pm'] as const).map((ap) => (
              <button
                key={ap}
                type="button"
                onClick={() => set({ ampm: ap })}
                className={`flex-1 rounded-[6px] py-1 text-[12px] font-semibold uppercase ${
                  (parts?.ampm ?? 'am') === ap ? 'bg-tide text-tide-ink' : 'text-ink-muted hover:bg-sunken'
                }`}
              >
                {ap}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Column
              label="Hour"
              options={HOURS}
              active={parts?.h12 ?? null}
              format={(h) => String(h)}
              onPick={(h) => set({ h12: h })}
            />
            <Column
              label="Min"
              options={MINUTES}
              active={parts?.m ?? null}
              format={(m) => String(m).padStart(2, '0')}
              onPick={(m) => set({ m })}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Column({
  label,
  options,
  active,
  format,
  onPick,
}: {
  label: string
  options: number[]
  active: number | null
  format: (n: number) => string
  onPick: (n: number) => void
}) {
  return (
    <div>
      <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </div>
      <div className="flex max-h-[148px] flex-col gap-0.5 overflow-y-auto pr-0.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onPick(o)}
            className={`tnum rounded-[6px] px-2 py-1 text-left text-[13px] ${
              active === o ? 'bg-tide-soft font-semibold text-tide' : 'hover:bg-sunken'
            }`}
          >
            {format(o)}
          </button>
        ))}
      </div>
    </div>
  )
}
