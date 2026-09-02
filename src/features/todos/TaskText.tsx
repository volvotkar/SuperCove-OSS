import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * Task title that stays one truncated line by default and expands to the full
 * wrapped text on click. The chevron only appears when the text actually
 * overflows, so short tasks look exactly as before. Clicking the text itself
 * still runs onClick (Google Calendar scheduling in the todo list).
 */
export function TaskText({
  text,
  done,
  onClick,
  clickTitle,
}: {
  text: string
  done?: boolean
  onClick?: () => void
  clickTitle?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Only measure while collapsed; when expanded the text wraps and would
    // report no overflow, which would wrongly hide the collapse chevron.
    if (expanded) return
    const el = ref.current
    if (!el) return
    const check = () => setOverflowing(el.scrollWidth > el.clientWidth + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text, expanded])

  return (
    <div className="flex min-w-0 items-start gap-1">
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        title={clickTitle}
        className={`block min-w-0 flex-1 text-left text-[14px] underline decoration-dashed decoration-transparent underline-offset-4 transition-colors ${
          onClick ? 'hover:decoration-[var(--tide)]' : 'cursor-default'
        } ${expanded ? 'whitespace-normal break-words' : 'truncate'} ${
          done ? 'text-ink-faint line-through decoration-solid' : ''
        }`}
      >
        {text}
      </button>
      {overflowing && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? 'Collapse task' : 'Show full task'}
          className="mt-[3px] shrink-0 rounded p-0.5 text-ink-faint transition-colors hover:bg-sunken hover:text-ink"
        >
          <ChevronDown
            size={14}
            className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      )}
    </div>
  )
}
