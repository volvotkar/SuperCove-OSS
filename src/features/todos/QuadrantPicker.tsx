import { useEffect, useRef, useState } from 'react'
import { useUpdate } from '../../lib/data'
import type { Quadrant, Todo } from '../../lib/types'
import { NONE_META, QUADRANTS, QUADRANT_META, quadrantColor, quadrantLabel } from '../../lib/matrix'

/**
 * The little matrix dot on every task: shows the quadrant color, opens a
 * compact popover to change it. Gray outline = None.
 */
export function QuadrantPicker({ todo }: { todo: Todo }) {
  const update = useUpdate<Todo>('todos')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function choose(q: Quadrant | null) {
    update.mutate({ id: todo.id, patch: { priority: q } })
    setOpen(false)
  }

  return (
    <span ref={rootRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`Priority: ${quadrantLabel(todo.priority)}`}
        aria-label={`Set priority (currently ${quadrantLabel(todo.priority)})`}
        className="grid h-5 w-5 place-items-center rounded-full hover:bg-sunken"
      >
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={
            todo.priority
              ? { background: quadrantColor(todo.priority) }
              : { border: `1.5px solid ${quadrantColor(null)}` }
          }
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-52 rounded-field border border-line bg-surface py-1 shadow-lg">
          {QUADRANTS.map((q) => (
            <PickRow
              key={q}
              color={quadrantColor(q)}
              label={QUADRANT_META[q].label}
              hint={QUADRANT_META[q].hint}
              active={todo.priority === q}
              onClick={() => choose(q)}
            />
          ))}
          <div className="mx-2 my-1 border-t border-line" />
          <PickRow
            color={quadrantColor(null)}
            label={NONE_META.label}
            hint={NONE_META.hint}
            active={todo.priority === null}
            hollow
            onClick={() => choose(null)}
          />
        </div>
      )}
    </span>
  )
}

function PickRow({
  color,
  label,
  hint,
  active,
  hollow,
  onClick,
}: {
  color: string
  label: string
  hint: string
  active: boolean
  hollow?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-sunken ${
        active ? 'bg-sunken' : ''
      }`}
    >
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={hollow ? { border: `1.5px solid ${color}` } : { background: color }}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium">{label}</span>
        <span className="block text-[11px] text-ink-faint">{hint}</span>
      </span>
    </button>
  )
}
