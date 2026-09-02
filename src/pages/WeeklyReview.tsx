import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, NotebookPen } from 'lucide-react'
import { useInsert, useRows, useUpdate } from '../lib/data'
import { shortDate } from '../lib/format'
import type { Todo, TodoList } from '../lib/types'
import { Card, EmptyState, Label, PageHeader } from '../components/ui'

type WeeklyReview = {
  id: string
  week_start: string
  what_happened: string
  whats_open: string
  whats_next: string
  updated_at: string
}

/** Monday of the current week (the week the review belongs to). */
function currentWeekStart(): string {
  const d = new Date()
  const day = (d.getDay() + 6) % 7 // Mon=0 … Sun=6
  d.setDate(d.getDate() - day)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const FIELDS = [
  { key: 'what_happened', label: 'What happened', hint: 'Wins, misses, anything notable across ventures and prep.' },
  { key: 'whats_open', label: 'What’s open', hint: 'Loose ends — pending payments, blocked tasks, waiting-on-others.' },
  { key: 'whats_next', label: 'What’s next', hint: 'The few things that matter most next week.' },
] as const

export function WeeklyReviewPage() {
  const { data: reviews = [] } = useRows<WeeklyReview>('weekly_reviews', { column: 'week_start', ascending: false })
  const insert = useInsert<WeeklyReview>('weekly_reviews')

  const weekStart = currentWeekStart()
  const current = reviews.find((r) => r.week_start === weekStart)
  const past = reviews.filter((r) => r.week_start !== weekStart)

  // First visit of the week: create the row so typing autosaves into it.
  const creating = useRef(false)
  useEffect(() => {
    if (!current && !creating.current && !insert.isPending) {
      creating.current = true
      insert.mutate({ week_start: weekStart })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  return (
    <div>
      <PageHeader title="Weekly Review" />
      <p className="-mt-4 mb-6 text-[13.5px] text-ink-muted">
        Week of {shortDate(weekStart)} — a ten-minute ritual, not a report.
      </p>

      <DoneThisWeek weekStart={weekStart} />

      {current ? <ReviewEditor review={current} /> : <EmptyState>Setting up this week…</EmptyState>}

      {past.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
            Past weeks
          </h2>
          <div className="flex flex-col gap-3">
            {past.map((r) => (
              <PastReview key={r.id} review={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/** Read-only receipts: everything checked off since Monday. */
function DoneThisWeek({ weekStart }: { weekStart: string }) {
  const { data: todos = [] } = useRows<Todo>('todos', { column: 'position' })
  const { data: lists = [] } = useRows<TodoList>('todo_lists', { column: 'position' })

  const done = useMemo(
    () =>
      todos
        .filter(
          (t) => t.done && !t.cancelled_at && t.completed_at && t.completed_at.slice(0, 10) >= weekStart,
        )
        .sort((a, b) => b.completed_at!.localeCompare(a.completed_at!)),
    [todos, weekStart],
  )

  const listName = (id: string) => lists.find((l) => l.id === id)?.name

  const dayFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short' })

  return (
    <Card className="mb-4 px-4 py-4">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-pos-soft text-pos">
          <CheckCircle2 size={13} />
        </span>
        Done this week
        {done.length > 0 && <span className="font-normal normal-case text-ink-faint">{done.length} tasks</span>}
      </h2>
      {done.length === 0 ? (
        <p className="mt-2 text-[13px] text-ink-faint">Nothing checked off yet this week.</p>
      ) : (
        <ul className="mt-2.5 flex flex-col gap-1">
          {done.map((t) => (
            <li key={t.id} className="flex items-baseline gap-2.5 text-[13.5px]">
              <span className="tnum w-9 shrink-0 text-[11.5px] font-semibold text-ink-faint">
                {dayFmt.format(new Date(t.completed_at!))}
              </span>
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              {listName(t.list_id) && (
                <span className="shrink-0 text-[11.5px] text-ink-faint">{listName(t.list_id)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function ReviewEditor({ review }: { review: WeeklyReview }) {
  const update = useUpdate<WeeklyReview>('weekly_reviews')
  const [draft, setDraft] = useState({
    what_happened: review.what_happened,
    whats_open: review.whats_open,
    whats_next: review.whats_next,
  })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const dirty =
      draft.what_happened !== review.what_happened ||
      draft.whats_open !== review.whats_open ||
      draft.whats_next !== review.whats_next
    if (!dirty) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      update.mutate({ id: review.id, patch: { ...draft, updated_at: new Date().toISOString() } })
    }, 800)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  return (
    <Card className="px-5 py-5">
      <div className="mb-1 flex items-center justify-between">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-tide-soft text-tide">
          <NotebookPen size={14} />
        </span>
        <span className="text-[11.5px] text-ink-faint">{update.isPending ? 'Saving…' : 'Saved'}</span>
      </div>
      <div className="flex flex-col gap-5">
        {FIELDS.map((f) => (
          <label key={f.key}>
            <Label>{f.label}</Label>
            <textarea
              value={draft[f.key]}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              placeholder={f.hint}
              rows={3}
              className="w-full resize-y rounded-field border border-line bg-surface px-3 py-2 text-[14px] leading-relaxed placeholder:text-ink-faint focus:border-tide"
            />
          </label>
        ))}
      </div>
    </Card>
  )
}

function PastReview({ review }: { review: WeeklyReview }) {
  const [open, setOpen] = useState(false)
  const empty = !review.what_happened && !review.whats_open && !review.whats_next

  return (
    <Card className="px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-[14px] font-medium">Week of {shortDate(review.week_start)}</span>
        <span className="text-[12px] text-ink-faint">{empty ? 'Empty' : open ? 'Hide' : 'Show'}</span>
      </button>
      {open && !empty && (
        <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
          {FIELDS.map(
            (f) =>
              review[f.key] && (
                <div key={f.key}>
                  <div className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
                    {f.label}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-[13.5px] leading-relaxed">{review[f.key]}</p>
                </div>
              ),
          )}
        </div>
      )}
    </Card>
  )
}
