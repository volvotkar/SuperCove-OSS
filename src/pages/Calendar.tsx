import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarX2, ChevronLeft, ChevronRight, CircleSlash, PlugZap, RefreshCw } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { listEvents, getGoogleToken, type GcalEvent } from '../lib/gcal'
import { todayISO } from '../lib/format'
import { TimeLogCard } from '../features/timelog/TimeLogCard'
import { Button, Card, EmptyState, PageHeader } from '../components/ui'

/**
 * Custom day agenda over the Calendar API. (The old Google Calendar iframe
 * embed can't work anymore: browsers partition third-party cookies, so the
 * embed never sees the Google session for private calendars.)
 */

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function mondayOf(iso: string): Date {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

export function Calendar() {
  const { signInWithGoogle } = useAuth()
  const [selected, setSelected] = useState(todayISO())

  // Deliberately never cached (see dehydrate filter in main.tsx): a stale
  // "false" here would survive the OAuth redirect and hide the calendar.
  const { data: connected } = useQuery({
    queryKey: ['gcal-connected'],
    queryFn: async () => !!(await getGoogleToken()),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  })

  const week = useMemo(() => {
    const start = mondayOf(selected)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      return d
    })
  }, [selected])

  const events = useQuery({
    queryKey: ['gcal-events', selected],
    enabled: connected === true,
    staleTime: 60_000,
    queryFn: () => {
      const dayStart = new Date(selected + 'T00:00:00')
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)
      return listEvents(dayStart.toISOString(), dayEnd.toISOString())
    },
  })

  function shiftWeek(dir: -1 | 1) {
    const d = new Date(selected + 'T00:00:00')
    d.setDate(d.getDate() + dir * 7)
    setSelected(toISODate(d))
  }

  const today = todayISO()
  const dayLabel = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(selected + 'T00:00:00'))

  return (
    <div>
      <PageHeader
        title="Calendar"
        action={
          selected !== today ? (
            <Button variant="ghost" onClick={() => setSelected(today)}>
              Today
            </Button>
          ) : undefined
        }
      />

      {connected === false && (
        <Card className="mb-4 flex flex-col items-start gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
          <div className="flex-1">
            <div className="flex items-center gap-1.5 text-[14px] font-medium">
              <PlugZap size={16} className="text-awaited" />
              Google Calendar not connected
            </div>
            <p className="mt-0.5 text-[13px] text-ink-muted">
              Sign in with Google (calendar access included) to see your day here and schedule
              tasks as events.
            </p>
          </div>
          <Button variant="ghost" onClick={signInWithGoogle}>
            Connect Google Calendar
          </Button>
        </Card>
      )}

      {/* Week strip */}
      <div className="mb-4 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => shiftWeek(-1)}
          className="grid h-9 w-8 shrink-0 place-items-center rounded-field text-ink-muted hover:bg-sunken"
          aria-label="Previous week"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="grid flex-1 grid-cols-7 gap-1.5">
          {week.map((d) => {
            const iso = toISODate(d)
            const isSelected = iso === selected
            const isToday = iso === today
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelected(iso)}
                className={`flex flex-col items-center rounded-field border py-1.5 transition-colors ${
                  isSelected
                    ? 'border-tide bg-tide text-tide-ink'
                    : 'border-line bg-surface hover:bg-sunken'
                }`}
              >
                <span
                  className={`text-[10.5px] font-semibold uppercase tracking-wide ${
                    isSelected ? 'opacity-80' : 'text-ink-faint'
                  }`}
                >
                  {new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(d)}
                </span>
                <span
                  className={`tnum text-[15px] font-semibold ${
                    !isSelected && isToday ? 'text-tide' : ''
                  }`}
                >
                  {d.getDate()}
                </span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => shiftWeek(1)}
          className="grid h-9 w-8 shrink-0 place-items-center rounded-field text-ink-muted hover:bg-sunken"
          aria-label="Next week"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
        {dayLabel}
      </h2>

      {connected !== true ? (
        <EmptyState>Connect Google Calendar to see this day.</EmptyState>
      ) : events.isLoading ? (
        <EmptyState>Loading events…</EmptyState>
      ) : events.isError ? (
        <Card className="flex flex-col items-start gap-3 px-4 py-4 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 text-[13.5px] text-neg">
            <CalendarX2 size={15} className="shrink-0" />
            {events.error.message}
          </div>
          <Button variant="ghost" onClick={() => events.refetch()}>
            <RefreshCw size={14} /> Retry
          </Button>
        </Card>
      ) : (
        <Agenda events={events.data ?? []} />
      )}

      {/* What actually happened — the time logger for the selected day */}
      <TimeLogCard date={selected} />
    </div>
  )
}

function Agenda({ events }: { events: GcalEvent[] }) {
  const allDay = events.filter((e) => e.start.date)
  const timed = events.filter((e) => e.start.dateTime)

  if (events.length === 0) {
    return (
      <EmptyState>
        <span className="flex items-center gap-1.5">
          <CircleSlash size={14} /> Clear day — nothing scheduled.
        </span>
      </EmptyState>
    )
  }

  const fmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' })

  return (
    <Card>
      <ul className="divide-y divide-line">
        {allDay.map((e) => (
          <li key={e.id} className="flex items-center gap-3 px-4 py-3">
            <span className="shrink-0 rounded-full bg-sunrise-soft px-2 py-0.5 text-[11px] font-semibold text-sunrise">
              All day
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
              {e.summary ?? '(no title)'}
            </span>
          </li>
        ))}
        {timed.map((e) => {
          const start = new Date(e.start.dateTime!)
          const end = e.end.dateTime ? new Date(e.end.dateTime) : null
          const past = (end ?? start).getTime() < Date.now()
          return (
            <li key={e.id} className={`flex items-center gap-3 px-4 py-3 ${past ? 'opacity-55' : ''}`}>
              <span className="tnum w-[104px] shrink-0 text-[12.5px] text-ink-muted">
                {fmt.format(start)}
                {end ? ` – ${fmt.format(end)}` : ''}
              </span>
              <span className="h-6 w-0.5 shrink-0 rounded-full bg-tide" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">
                  {e.summary ?? '(no title)'}
                </span>
                {e.location && (
                  <span className="block truncate text-[12px] text-ink-faint">{e.location}</span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
