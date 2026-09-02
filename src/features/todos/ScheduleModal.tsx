import { useState } from 'react'
import { CalendarClock, RotateCcw, X } from 'lucide-react'
import { useUpdate } from '../../lib/data'
import type { Todo } from '../../lib/types'
import { toLocalDateInput, toLocalTimeInput, todayISO } from '../../lib/format'
import { createCalendarEvent, unlinkTaskEvent, updateCalendarEvent } from '../../lib/gcal'
import { Button, Input, Label, Modal, Select } from '../../components/ui'

/**
 * The task→calendar modal: date, time, duration → real Google Calendar event.
 * Without a Google token (local dev / not yet connected) the schedule is saved
 * on the task and the event is created when Google is connected — never silent.
 */
export function ScheduleModal({ todo, onClose }: { todo: Todo; onClose: () => void }) {
  const update = useUpdate<Todo>('todos')
  // Read through Date, not string slices: scheduled_at comes back as UTC.
  const [date, setDate] = useState(
    todo.scheduled_at ? toLocalDateInput(todo.scheduled_at) : todayISO(),
  )
  const [time, setTime] = useState(
    todo.scheduled_at ? toLocalTimeInput(todo.scheduled_at) : '10:00',
  )
  const [duration, setDuration] = useState(String(todo.scheduled_duration_mins ?? 30))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const startISO = new Date(`${date}T${time}:00`).toISOString()
    const mins = Number(duration)
    try {
      // Already linked? Move that event rather than creating a second one —
      // creating was what left duplicates behind on every reschedule.
      const existing = todo.gcal_event_id
      const input = { summary: todo.title, startISO, durationMins: mins }
      const moved = existing ? await updateCalendarEvent(existing, input) : false
      // Only fall through to create when there's nothing to move (new task, or
      // the event was deleted on the Google side).
      const created = moved ? null : await createCalendarEvent(input)
      // Never null an existing link just because Google was unreachable.
      const eventId = moved ? existing : (created ?? existing)
      const synced = moved || created !== null

      update.mutate(
        {
          id: todo.id,
          patch: {
            scheduled_at: startISO,
            scheduled_duration_mins: mins,
            gcal_event_id: eventId,
          },
        },
        {
          onSuccess: () => {
            if (synced) onClose()
            else if (existing)
              setNotice(
                'Saved on the task, but Google Calendar couldn’t be reached — the event there still shows the old time. Reopen this once you’re back online.',
              )
            else
              setNotice(
                'Saved on the task. Google Calendar isn’t connected yet — the event will be created once you connect it from the Calendar tab.',
              )
          },
        },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the event.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Schedule on calendar" onClose={onClose}>
      <p className="mb-4 flex items-center gap-2 rounded-field bg-sunken px-3 py-2 text-[13.5px] text-ink-muted">
        <CalendarClock size={15} className="shrink-0" />
        <span className="truncate">{todo.title}</span>
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        {/* Single column on a phone — two native date/time inputs don't fit
            side by side at 375px. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label>
            <Label>Time</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </label>
        </div>
        <label>
          <Label>Duration</Label>
          <Select value={duration} onChange={(e) => setDuration(e.target.value)}>
            <option value="15">15 min</option>
            <option value="30">30 min</option>
            <option value="45">45 min</option>
            <option value="60">1 hour</option>
            <option value="90">1.5 hours</option>
            <option value="120">2 hours</option>
          </Select>
        </label>
        <Button type="submit" disabled={busy} className="mt-1">
          {busy ? 'Scheduling…' : 'Schedule'}
        </Button>
        {notice && (
          <p className="rounded-field bg-awaited-soft px-3 py-2 text-[13px] text-awaited">{notice}</p>
        )}
        {notice && (
          <Button variant="ghost" onClick={onClose}>
            Got it
          </Button>
        )}
        {error && <p className="text-[13px] text-neg">{error}</p>}
      </form>

      {/* Cross out: keeps the task on its list but pulls it off the agenda and
          the calendar. Deleting is still the trash icon on the row. */}
      <div className="mt-4 border-t border-line pt-3">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            if (!todo.cancelled_at) await unlinkTaskEvent(todo.gcal_event_id)
            update.mutate(
              {
                id: todo.id,
                patch: todo.cancelled_at
                  ? { cancelled_at: null }
                  : { cancelled_at: new Date().toISOString(), gcal_event_id: null },
              },
              { onSuccess: onClose, onSettled: () => setBusy(false) },
            )
          }}
          className="flex items-center gap-1.5 text-left text-[13px] font-medium text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
        >
          {todo.cancelled_at ? (
            <RotateCcw size={14} className="shrink-0" />
          ) : (
            <X size={14} className="shrink-0" />
          )}
          {todo.cancelled_at ? 'Bring this task back' : 'Cross out task'}
        </button>
        <p className="mt-1 text-[12px] text-ink-faint">
          {todo.cancelled_at
            ? 'It returns to the list unscheduled — reschedule it above if you need a slot.'
            : 'Stays on the list, struck through. Removed from today’s agenda and from Google Calendar.'}
        </p>
      </div>
    </Modal>
  )
}
