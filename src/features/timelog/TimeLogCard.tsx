import { useMemo, useState } from 'react'
import { Hourglass, Plus, Trash2 } from 'lucide-react'
import { useDelete, useInsert, useRows } from '../../lib/data'
import type { Quadrant, TimeLog } from '../../lib/types'
import { QUADRANTS, RETRO_META, RETRO_NONE, quadrantColor, quadrantSoft } from '../../lib/matrix'
import { Button, Card, Input, Select } from '../../components/ui'
import { TimePicker } from '../../components/TimePicker'
import { TaskText } from '../todos/TaskText'

/**
 * Time logger for one day: what happened, when, and which quadrant it served
 * (None = life: sleep, chores). Lives under the Calendar day agenda.
 * Overnight blocks are split at midnight by convention.
 */

export function minutesToHM(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  const ampm = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

export function durationLabel(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function TimeLogCard({ date }: { date: string }) {
  const { data: allLogs = [] } = useRows<TimeLog>('time_logs', { column: 'start_min' })
  const insert = useInsert<TimeLog>('time_logs')
  const del = useDelete('time_logs')
  const [adding, setAdding] = useState(false)

  const logs = useMemo(
    () => allLogs.filter((l) => l.on_date === date).sort((a, b) => a.start_min - b.start_min),
    [allLogs, date],
  )

  const lastEnd = logs.length ? logs[logs.length - 1].end_min : 0
  const loggedMins = logs.reduce((s, l) => s + (l.end_min - l.start_min), 0)

  // Custom TimePicker → controlled state in minutes-of-day (no native input).
  const [start, setStart] = useState<number | null>(null)
  const [end, setEnd] = useState<number | null>(null)
  const [activity, setActivity] = useState('')
  const [quadrant, setQuadrant] = useState<'' | Quadrant>('')
  const [formError, setFormError] = useState<string | null>(null)

  // Start defaults to where the last block ended.
  const effectiveStart = start ?? Math.min(lastEnd, 1435)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    const s = effectiveStart
    if (end === null) return setFormError('Pick an end time.')
    if (end <= s) return setFormError('End must be after start — split overnight blocks at midnight.')
    if (!activity.trim()) return setFormError('What were you doing?')
    insert.mutate(
      {
        on_date: date,
        start_min: s,
        end_min: end,
        activity: activity.trim(),
        quadrant: quadrant || null,
      },
      {
        onSuccess: () => {
          setStart(null) // re-prefills to the new last-end
          setEnd(null)
          setActivity('')
          setQuadrant('')
        },
        onError: (err) => setFormError(err.message),
      },
    )
  }

  return (
    <Card className="mt-6">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-tide-soft text-tide">
            <Hourglass size={13} />
          </span>
          <h2 className="text-[14px] font-semibold">Time log</h2>
          {loggedMins > 0 && (
            <span className="tnum text-[12px] text-ink-faint">{durationLabel(loggedMins)} logged</span>
          )}
          {loggedMins > 1440 && (
            <span className="rounded-full bg-awaited-soft px-2 py-0.5 text-[10.5px] font-semibold text-awaited">
              Blocks overlap
            </span>
          )}
        </div>
        {!adding && (
          <Button variant="ghost" onClick={() => setAdding(true)} className="px-3 py-1.5 text-[13px]">
            <Plus size={14} /> Log time
          </Button>
        )}
      </div>

      {logs.length === 0 && !adding ? (
        <p className="px-4 py-6 text-center text-[13px] text-ink-faint">
          Nothing logged for this day. “Log time” and reconstruct it — sleep counts (Life).
        </p>
      ) : (
        <ul className="py-1">
          {logs.map((l, i) => {
            const gap = i > 0 ? l.start_min - logs[i - 1].end_min : 0
            return (
              <li key={l.id}>
                {gap > 0 && (
                  <div className="flex items-center gap-2 px-4 py-0.5">
                    <span className="h-px flex-1 border-t border-dashed border-line" />
                    <span className="tnum text-[10.5px] text-ink-faint">{durationLabel(gap)} unlogged</span>
                    <span className="h-px flex-1 border-t border-dashed border-line" />
                  </div>
                )}
                <div className="group flex items-start gap-2.5 px-4 py-2">
                  <span
                    className="mt-1.5 h-4 w-1 shrink-0 rounded-full"
                    style={{ background: quadrantColor(l.quadrant) }}
                  />
                  <div className="min-w-0 flex-1">
                    {/* Activity gets its own line so it's never squeezed; expands on click. */}
                    <TaskText text={l.activity} />
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-faint">
                      <span className="tnum">
                        {minutesToHM(l.start_min)} – {l.end_min === 1440 ? '12:00 am' : minutesToHM(l.end_min)}
                      </span>
                      <span>·</span>
                      <span className="tnum">{durationLabel(l.end_min - l.start_min)}</span>
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ color: quadrantColor(l.quadrant), background: quadrantSoft(l.quadrant) }}
                      >
                        {l.quadrant ? RETRO_META[l.quadrant].label : RETRO_NONE.short}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    title="Delete block"
                    onClick={() => del.mutate(l.id)}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-faint opacity-100 transition-all hover:bg-neg-soft hover:text-neg sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {adding && (
        <form onSubmit={submit} className="border-t border-line px-4 py-3">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[110px_110px_1fr_150px]">
            <div>
              <span className="mb-1 block text-[11.5px] font-medium text-ink-muted">From</span>
              <TimePicker value={effectiveStart} onChange={setStart} />
            </div>
            <div>
              <span className="mb-1 block text-[11.5px] font-medium text-ink-muted">To</span>
              <TimePicker value={end} onChange={setEnd} placeholder="End time" />
            </div>
            <label className="col-span-2 sm:col-span-1">
              <span className="mb-1 block text-[11.5px] font-medium text-ink-muted">Doing what</span>
              <Input
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
                placeholder="Sleep, deep work, commute…"
              />
            </label>
            <label className="col-span-2 sm:col-span-1">
              <span className="mb-1 block text-[11.5px] font-medium text-ink-muted">
                Was it important / urgent?
              </span>
              <Select value={quadrant} onChange={(e) => setQuadrant(e.target.value as '' | Quadrant)}>
                <option value="">{RETRO_NONE.label}</option>
                {QUADRANTS.map((q) => (
                  <option key={q} value={q}>
                    {RETRO_META[q].label}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <div className="mt-2.5 flex items-center gap-3">
            <Button type="submit" disabled={insert.isPending} className="px-3.5 py-1.5 text-[13px]">
              {insert.isPending ? 'Saving…' : 'Add block'}
            </Button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="text-[12.5px] text-ink-faint hover:text-ink"
            >
              Done
            </button>
            {formError && <span className="text-[12.5px] text-neg">{formError}</span>}
          </div>
        </form>
      )}
    </Card>
  )
}
