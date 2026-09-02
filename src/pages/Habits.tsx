import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CopyPlus, Flame, Plus, Trash2 } from 'lucide-react'
import { useDelete, useInsert, useRows } from '../lib/data'
import type { Habit, HabitCheck } from '../lib/types'
import { shortDate, todayISO } from '../lib/format'
import { useDragScroll } from '../lib/useDragScroll'
import { Button, Card, EmptyState, Input, Label, Modal, PageHeader, Select } from '../components/ui'
import { MonthHeatmap } from '../components/charts'

/**
 * Dedicated habit tracker: habits are scoped to a month (for monthly
 * experiments) or ongoing (month = null — includes all pre-existing habits).
 * The month grid is the primary UI: click any past/today cell to toggle.
 */

function currentMonth(): string {
  return todayISO().slice(0, 7)
}

function shiftMonth(m: string, dir: -1 | 1): string {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 1 + dir, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(m: string): string {
  const [y, mo] = m.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(y, mo - 1, 1))
}

export function Habits() {
  const [month, setMonth] = useState(currentMonth)
  const { data: habits = [] } = useRows<Habit>('habits', { column: 'position' })
  const { data: checks = [] } = useRows<HabitCheck>('habit_checks', { column: 'on_date' })
  const insertHabit = useInsert<Habit>('habits')
  const delHabit = useDelete('habits')
  const insertCheck = useInsert<HabitCheck>('habit_checks')
  const delCheck = useDelete('habit_checks')
  const [adding, setAdding] = useState(false)
  const gridScroll = useDragScroll<HTMLDivElement>()

  const visible = useMemo(
    () => habits.filter((h) => h.month === month || h.month === null),
    [habits, month],
  )
  const lastMonthHabits = useMemo(
    () => habits.filter((h) => h.month === shiftMonth(month, -1)),
    [habits, month],
  )

  const today = todayISO()
  const [y, mo] = month.split('-').map(Number)
  const daysInMonth = new Date(y, mo, 0).getDate()

  const checkSet = useMemo(() => {
    const s = new Map<string, HabitCheck>()
    for (const c of checks) s.set(`${c.habit_id}|${c.on_date}`, c)
    return s
  }, [checks])

  function toggle(habit: Habit, iso: string) {
    const existing = checkSet.get(`${habit.id}|${iso}`)
    if (existing) delCheck.mutate(existing.id)
    else insertCheck.mutate({ habit_id: habit.id, on_date: iso })
  }

  // Stats for the widgets below the grid.
  const daysElapsed = month === today.slice(0, 7) ? Number(today.slice(8)) : daysInMonth
  const monthChecks = useMemo(
    () => checks.filter((c) => c.on_date.startsWith(month) && visible.some((h) => h.id === c.habit_id)),
    [checks, month, visible],
  )
  const byDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of monthChecks) m.set(c.on_date, (m.get(c.on_date) ?? 0) + 1)
    return m
  }, [monthChecks])
  const intensity = useMemo(() => {
    const m = new Map<string, number>()
    for (const [iso, n] of byDay) m.set(iso, visible.length ? n / visible.length : 0)
    return m
  }, [byDay, visible.length])

  function copyLastMonth() {
    for (const h of lastMonthHabits) {
      insertHabit.mutate({ name: h.name, month, position: h.position })
    }
  }

  return (
    <div>
      <PageHeader
        title="Habits"
        action={
          <Button onClick={() => setAdding(true)}>
            <Plus size={15} /> Habit
          </Button>
        }
      />

      {/* Month switcher */}
      <div className="mb-5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          className="grid h-8 w-8 place-items-center rounded-field text-ink-muted hover:bg-sunken"
          aria-label="Previous month"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="font-display min-w-[150px] text-center text-[15px] font-semibold">
          {monthLabel(month)}
        </span>
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          className="grid h-8 w-8 place-items-center rounded-field text-ink-muted hover:bg-sunken"
          aria-label="Next month"
        >
          <ChevronRight size={16} />
        </button>
        {month !== currentMonth() && (
          <Button variant="ghost" onClick={() => setMonth(currentMonth())} className="px-3 py-1.5 text-[13px]">
            This month
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <EmptyState>
            No habits for {monthLabel(month)}. Add one — monthly experiments live here.
          </EmptyState>
          {lastMonthHabits.length > 0 && (
            <Button variant="ghost" onClick={copyLastMonth}>
              <CopyPlus size={15} /> Copy last month’s {lastMonthHabits.length} habit
              {lastMonthHabits.length === 1 ? '' : 's'}
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Fixed comfortable cells; the whole grid scrolls horizontally on
              narrow screens (scrollbar chrome hidden), habit-name column pinned. */}
          <Card className="p-0">
            {/* No horizontal padding on the scrolling content: with px-* here,
                `sticky left-0` would pin the label column left of its resting
                position, so it visibly jumped and clipped on first scroll.
                The padding lives inside the label cell and a trailing spacer
                column instead. */}
            <div ref={gridScroll} className="no-scrollbar cursor-grab select-none overflow-x-auto active:cursor-grabbing">
              <div className="min-w-max py-3.5">
                <div
                  className="grid gap-1.5 pb-2.5"
                  style={{ gridTemplateColumns: gridTemplate(daysInMonth) }}
                >
                  <div className="sticky left-0 z-10 self-stretch bg-surface" />
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const iso = `${month}-${String(i + 1).padStart(2, '0')}`
                    return (
                      <div
                        key={i}
                        className={`tnum text-center text-[11.5px] font-medium ${
                          iso === today ? 'text-tide' : 'text-ink-faint'
                        }`}
                      >
                        {i + 1}
                      </div>
                    )
                  })}
                  <div />
                </div>
                {visible.map((h) => (
                  <HabitRow
                    key={h.id}
                    habit={h}
                    month={month}
                    daysInMonth={daysInMonth}
                    today={today}
                    checkSet={checkSet}
                    onToggle={toggle}
                    onDelete={() => {
                      if (window.confirm(`Stop tracking “${h.name}”? Its history goes too.`))
                        delHabit.mutate(h.id)
                    }}
                  />
                ))}
              </div>
            </div>
          </Card>

          <p className="mt-3 text-[12.5px] text-ink-faint">
            Ongoing habits appear every month; monthly ones only in theirs. Click a day to toggle.
          </p>

          {/* Stats (moved here from the Statistics screen) */}
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="flex flex-col px-5 py-5">
              <div className="mb-1 flex items-baseline justify-between">
                <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
                  Contribution map
                </h2>
                <span className="text-[13px] text-ink-muted">
                  <span className="tnum text-[17px] font-semibold text-ink">{byDay.size}</span> active
                  {byDay.size === 1 ? ' day' : ' days'}
                </span>
              </div>
              <div className="no-scrollbar flex flex-1 items-center justify-center overflow-x-auto py-2">
                <MonthHeatmap
                  month={month}
                  intensity={intensity}
                  title={(iso) => `${shortDate(iso)}: ${byDay.get(iso) ?? 0}/${visible.length} habits`}
                />
              </div>
              <p className="text-[12px] text-ink-faint">Greener = more of that day’s habits done.</p>
            </Card>

            <Card className="px-5 py-5">
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
                Completion — {monthLabel(month)}
              </h2>
              <ul className="flex flex-col gap-3.5">
                {visible.map((h) => {
                  const count = monthChecks.filter((c) => c.habit_id === h.id).length
                  const pct = daysElapsed ? Math.round((count / daysElapsed) * 100) : 0
                  return (
                    <li key={h.id}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[14px]">
                        <span className="min-w-0 flex-1 truncate font-medium">{h.name}</span>
                        <span className="tnum shrink-0 text-[13px] text-ink-muted">
                          {count}/{daysElapsed} · {pct}%
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-sunken">
                        <div
                          className="h-full rounded-full bg-pos transition-all"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </Card>
          </div>
        </>
      )}

      {adding && <HabitForm month={month} onClose={() => setAdding(false)} />}
    </div>
  )
}

/**
 * Pinned label column + fixed 30px day squares + a trailing spacer so the last
 * cell doesn't touch the card edge. The label column carries the left padding
 * itself (166 = 150 label + 16 gutter) — see the note at the scroll container.
 */
function gridTemplate(days: number): string {
  return `166px repeat(${days}, 30px) 16px`
}

function HabitRow({
  habit,
  month,
  daysInMonth,
  today,
  checkSet,
  onToggle,
  onDelete,
}: {
  habit: Habit
  month: string
  daysInMonth: number
  today: string
  checkSet: Map<string, HabitCheck>
  onToggle: (h: Habit, iso: string) => void
  onDelete: () => void
}) {
  let monthCount = 0
  const cells = Array.from({ length: daysInMonth }, (_, i) => {
    const iso = `${month}-${String(i + 1).padStart(2, '0')}`
    const checked = checkSet.has(`${habit.id}|${iso}`)
    if (checked) monthCount += 1
    const future = iso > today
    return { iso, checked, future }
  })

  return (
    <div
      className="group grid items-center gap-1.5 border-t border-line py-2"
      style={{ gridTemplateColumns: gridTemplate(daysInMonth) }}
    >
      <div className="sticky left-0 z-10 min-w-0 self-stretch bg-surface pl-4 pr-3 shadow-[1px_0_0_var(--border)]">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 truncate text-[14px] font-medium">{habit.name}</span>
          <button
            type="button"
            title="Delete habit"
            onClick={onDelete}
            className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-ink-faint transition-all hover:bg-neg-soft hover:text-neg sm:opacity-0 sm:group-hover:opacity-100"
          >
            <Trash2 size={12} />
          </button>
        </div>
        <span className="flex items-center gap-1 text-[11px] text-ink-faint">
          {habit.month === null && <span>Ongoing ·</span>}
          <Flame size={11} className="text-sunrise" />
          <span className="tnum">{monthCount}/{daysInMonth}</span>
        </span>
      </div>
      {cells.map(({ iso, checked, future }) => (
        <button
          key={iso}
          type="button"
          disabled={future}
          onClick={() => onToggle(habit, iso)}
          aria-label={`${habit.name} on ${iso}: ${checked ? 'done' : 'not done'}`}
          className={`h-[30px] w-[30px] rounded-md transition-colors ${
            checked ? 'bg-pos' : future ? 'bg-sunken opacity-40' : 'bg-sunken hover:bg-pos-soft'
          } ${iso === today ? 'ring-2 ring-tide' : ''}`}
        />
      ))}
      <div />
    </div>
  )
}

function HabitForm({ month, onClose }: { month: string; onClose: () => void }) {
  const insert = useInsert<Habit>('habits')
  const [name, setName] = useState('')
  const [scope, setScope] = useState<'month' | 'ongoing'>('month')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    insert.mutate(
      { name: name.trim(), month: scope === 'month' ? month : null },
      { onSuccess: onClose },
    )
  }

  return (
    <Modal title="Add habit" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <label>
          <Label>Habit</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Read, workout, sleep by 12…"
            autoFocus
            required
          />
        </label>
        <label>
          <Label>Scope</Label>
          <Select value={scope} onChange={(e) => setScope(e.target.value as 'month' | 'ongoing')}>
            <option value="month">{monthLabel(month)} only (experiment)</option>
            <option value="ongoing">Ongoing — every month</option>
          </Select>
        </label>
        <Button type="submit" disabled={insert.isPending} className="mt-1">
          {insert.isPending ? 'Saving…' : 'Add habit'}
        </Button>
        {insert.isError && <p className="text-[13px] text-neg">{insert.error.message}</p>}
      </form>
    </Modal>
  )
}
