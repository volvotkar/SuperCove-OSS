import { useState } from 'react'
import { CalendarClock, Plus, Trash2 } from 'lucide-react'
import { useDelete, useInsert, useRows } from '../../lib/data'
import type { KeyDate } from '../../lib/types'
import { daysFromToday, shortDate } from '../../lib/format'
import { Button, Card, Input, Label, Modal } from '../../components/ui'

/** Dashboard countdown widget: exams, launches, trips, renewal deadlines. */
export function KeyDatesCard() {
  const { data: dates = [] } = useRows<KeyDate>('key_dates', { column: 'on_date' })
  const del = useDelete('key_dates')
  const [adding, setAdding] = useState(false)

  const upcoming = dates.filter((d) => daysFromToday(d.on_date) >= -1)

  return (
    <Card className="px-4 py-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
          <CalendarClock size={13} /> Key dates
        </h2>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="grid h-6 w-6 place-items-center rounded-full text-ink-faint hover:bg-sunken hover:text-ink"
          aria-label="Add key date"
        >
          <Plus size={14} />
        </button>
      </div>

      {upcoming.length === 0 ? (
        <p className="text-[13px] text-ink-faint">
          Nothing counting down. Add an exam, a launch, a renewal date…
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {upcoming.map((d) => {
            const days = daysFromToday(d.on_date)
            return (
              <li key={d.id} className="group flex items-center gap-2.5 rounded-field px-1.5 py-1.5 hover:bg-sunken">
                <span
                  className={`tnum shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${
                    days <= 3 ? 'bg-neg-soft text-neg' : days <= 14 ? 'bg-awaited-soft text-awaited' : 'bg-tide-soft text-tide'
                  }`}
                >
                  {days < 0 ? 'Yesterday' : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium">{d.title}</div>
                  <div className="text-[11.5px] text-ink-faint">{shortDate(d.on_date)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => del.mutate(d.id)}
                  title="Remove"
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-faint transition-all sm:opacity-0 hover:bg-neg-soft hover:text-neg sm:group-hover:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {adding && <KeyDateForm onClose={() => setAdding(false)} />}
    </Card>
  )
}

function KeyDateForm({ onClose }: { onClose: () => void }) {
  const insert = useInsert<KeyDate>('key_dates')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !date) return
    insert.mutate({ title: title.trim(), on_date: date }, { onSuccess: onClose })
  }

  return (
    <Modal title="Add key date" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <label>
          <Label>What</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Exam day, product launch…" autoFocus required />
        </label>
        <label>
          <Label>When</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <Button type="submit" disabled={insert.isPending} className="mt-1">
          {insert.isPending ? 'Saving…' : 'Add'}
        </Button>
        {insert.isError && <p className="text-[13px] text-neg">{insert.error.message}</p>}
      </form>
    </Modal>
  )
}
