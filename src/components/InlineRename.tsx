import { useEffect, useRef, useState } from 'react'

/**
 * Click-to-rename text. Carries the same dashed-underline-on-hover affordance
 * the schedulable task titles use, so "this text is editable" reads the same
 * way everywhere in the app.
 *
 * Enter or blur commits, Escape cancels, and an unchanged/empty value is a
 * no-op rather than a write.
 */
export function InlineRename({
  value,
  onRename,
  className = '',
  inputClassName = '',
  title = 'Click to rename',
}: {
  value: string
  onRename: (next: string) => void
  className?: string
  inputClassName?: string
  title?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  // Keep in step when the row changes underneath us (switching notes etc).
  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  useEffect(() => {
    if (editing) ref.current?.select()
  }, [editing])

  function commit() {
    const next = draft.trim()
    setEditing(false)
    if (!next || next === value) return setDraft(value)
    onRename(next)
  }

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          }
        }}
        className={`min-w-0 rounded-field border border-tide bg-surface px-1.5 py-0.5 outline-none ${inputClassName || className}`}
      />
    )
  }

  return (
    <button
      type="button"
      title={title}
      onClick={() => setEditing(true)}
      className={`min-w-0 truncate text-left underline decoration-dashed decoration-transparent underline-offset-4 transition-colors hover:decoration-[var(--tide)] ${className}`}
    >
      {value}
    </button>
  )
}
