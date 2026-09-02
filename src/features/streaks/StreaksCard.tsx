import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Flame, Plus, Trash2 } from 'lucide-react'
import { useDelete, useInsert, useRows } from '../../lib/data'
import { todayISO } from '../../lib/format'
import type { Habit, HabitCheck } from '../../lib/types'
import { Card, TaskCheck } from '../../components/ui'

/**
 * Streak tracker: simple daily checks (read, workout, sleep…). The point is
 * surfacing a slip in real time — not gamification. Streak = consecutive
 * days ending today (or yesterday, so an unchecked today doesn't zero it).
 */
export function StreaksCard() {
  const { data: allHabits = [] } = useRows<Habit>('habits', { column: 'position' })
  // Today's check-ins: ongoing habits + this month's experiments (see /habits)
  const habits = allHabits.filter((h) => h.month === null || h.month === todayISO().slice(0, 7))
  const { data: checks = [] } = useRows<HabitCheck>('habit_checks', { column: 'on_date', ascending: false })
  const insertHabit = useInsert<Habit>('habits')
  const delHabit = useDelete('habits')
  const insertCheck = useInsert<HabitCheck>('habit_checks')
  const delCheck = useDelete('habit_checks')
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const today = todayISO()

  function streakFor(habitId: string): number {
    const dates = new Set(checks.filter((c) => c.habit_id === habitId).map((c) => c.on_date))
    let streak = 0
    const cursor = new Date()
    // An unchecked today doesn't break the streak — start from yesterday if needed.
    if (!dates.has(today)) cursor.setDate(cursor.getDate() - 1)
    for (;;) {
      const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
      if (!dates.has(iso)) break
      streak += 1
      cursor.setDate(cursor.getDate() - 1)
    }
    return streak
  }

  function toggleToday(habit: Habit) {
    const existing = checks.find((c) => c.habit_id === habit.id && c.on_date === today)
    if (existing) delCheck.mutate(existing.id)
    else insertCheck.mutate({ habit_id: habit.id, on_date: today })
  }

  function addHabit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    insertHabit.mutate(
      { name: name.trim(), position: habits.length },
      {
        onSuccess: () => {
          setName('')
          setNaming(false)
        },
      },
    )
  }

  return (
    <Card className="px-4 py-4">
      <div className="mb-2 flex items-center justify-between">
        <Link
          to="/habits"
          className="group flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink-muted hover:text-ink"
        >
          <span className="grid h-6 w-6 place-items-center rounded-full bg-sunrise-soft text-sunrise">
            <Flame size={13} />
          </span>
          Streaks
          <ArrowRight size={12} className="transition-opacity sm:opacity-0 sm:group-hover:opacity-100" />
        </Link>
        <button
          type="button"
          onClick={() => setNaming((v) => !v)}
          className="grid h-6 w-6 place-items-center rounded-full text-ink-faint hover:bg-sunken hover:text-ink"
          aria-label="Add habit"
        >
          <Plus size={14} />
        </button>
      </div>

      {naming && (
        <form onSubmit={addHabit} className="mb-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Read, workout, sleep by 12…"
            autoFocus
            className="w-full rounded-field border border-line bg-surface px-2.5 py-1.5 text-[13px] placeholder:text-ink-faint focus:border-tide"
          />
        </form>
      )}

      {habits.length === 0 && !naming ? (
        <p className="text-[13px] text-ink-faint">Track a daily habit — check it off each day.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {habits.map((h) => {
            const streak = streakFor(h.id)
            const checkedToday = checks.some((c) => c.habit_id === h.id && c.on_date === today)
            return (
              <li key={h.id} className="group flex items-center gap-2.5">
                <TaskCheck
                  checked={checkedToday}
                  onChange={() => toggleToday(h)}
                  label={`Check off ${h.name} for today`}
                />
                <span className={`min-w-0 flex-1 truncate text-[13.5px] ${checkedToday ? 'text-ink-muted' : ''}`}>
                  {h.name}
                </span>
                {streak > 0 && (
                  <span className="tnum flex shrink-0 items-center gap-0.5 text-[12px] font-semibold text-sunrise">
                    <Flame size={12} />
                    {streak}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Stop tracking “${h.name}”?`)) delHabit.mutate(h.id)
                  }}
                  title="Remove habit"
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-ink-faint transition-all sm:opacity-0 hover:bg-neg-soft hover:text-neg sm:group-hover:opacity-100"
                >
                  <Trash2 size={12} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
