import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BellRing, CalendarCheck, FolderKanban, ListTodo } from 'lucide-react'
import { KeyDatesCard } from '../features/keydates/KeyDatesCard'
import { CaptureBar, InboxCard } from '../features/capture/QuickCapture'
import { StreaksCard } from '../features/streaks/StreaksCard'
import { useRows, useUpdate } from '../lib/data'
import type { Payment, Project, Todo, TodoList } from '../lib/types'
import { daysFromToday, money, isOnLocalDay, todayISO } from '../lib/format'
import { agendaListIdSet, dayListIdSet, isLeftover } from '../lib/rollover'
import { QuadrantPicker } from '../features/todos/QuadrantPicker'
import { TaskText } from '../features/todos/TaskText'
import { quadrantWeight } from '../lib/matrix'
import { Card, TaskCheck } from '../components/ui'
import { useAuth } from '../auth/AuthProvider'
import { useEnabledModules } from '../lib/useModules'

// Short, witty, deep — maximum wisdom per word.
const QUOTES: { text: string; by: string }[] = [
  { text: 'In all chaos there is a cosmos.', by: 'Carl Jung' },
  { text: 'We suffer more often in imagination than in reality.', by: 'Seneca' },
  { text: 'He who has a why to live can bear almost any how.', by: 'Nietzsche' },
  { text: 'The beginning is the most important part of the work.', by: 'Plato' },
  { text: 'We are what we repeatedly do.', by: 'Will Durant' },
  { text: 'Make haste slowly.', by: 'Augustus' },
  { text: 'No one steps in the same river twice.', by: 'Heraclitus' },
  { text: 'Action is eloquence.', by: 'Shakespeare' },
  { text: 'Whatever is well said by anyone belongs to me.', by: 'Seneca' },
  { text: 'Fortune favours the prepared mind.', by: 'Louis Pasteur' },
  { text: 'You cannot cross the sea by standing and staring at the water.', by: 'Tagore' },
  { text: 'What stands in the way becomes the way.', by: 'Marcus Aurelius' },
  { text: 'Well begun is half done.', by: 'Aristotle' },
  { text: 'Everything should be made as simple as possible, but not simpler.', by: 'Einstein' },
]

function dayOfYear(): number {
  const now = new Date()
  return Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000)
}

function timeGreeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Late night session'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function Dashboard() {
  const { session } = useAuth()
  const on = useEnabledModules()
  const { data: lists = [] } = useRows<TodoList>('todo_lists', { column: 'position' })
  const { data: todos = [] } = useRows<Todo>('todos', { column: 'position' })
  const { data: payments = [] } = useRows<Payment>('payments', { column: 'created_at' })

  const firstName = session?.user.user_metadata?.full_name?.split(' ')[0]

  const today = todayISO()

  // Only Day lists explicitly pinned to today count. Membership in *any* day
  // list used to qualify, so future lists ("1st August…") flooded this card.
  const agendaListIds = useMemo(() => agendaListIdSet(lists, today), [lists, today])
  // "From earlier" is about Day-list staleness, not about what's pinned.
  const dayListIds = useMemo(() => dayListIdSet(lists), [lists])

  const todaysTasks = useMemo(
    () =>
      todos.filter(
        (t) =>
          !t.cancelled_at &&
          (agendaListIds.has(t.list_id) ||
            t.due_on === today ||
            // Local-day compare: scheduled_at is UTC, slicing it misfires near midnight.
            isOnLocalDay(t.scheduled_at, today)),
      ),
    [todos, agendaListIds, today],
  )
  const openTasks = todaysTasks
    .filter((t) => !t.done)
    .sort((a, b) => quadrantWeight(a.priority) - quadrantWeight(b.priority) || a.position - b.position)
  const doneCount = todaysTasks.length - openTasks.length

  const dueFollowUps = useMemo(
    () =>
      payments.filter(
        (p) => p.status === 'awaited' && p.follow_up_on && daysFromToday(p.follow_up_on) <= 0,
      ),
    [payments],
  )

  const quote = QUOTES[dayOfYear() % QUOTES.length]

  return (
    <div>
      {/* Greeting — the warm corner of the app */}
      <div className="mb-6 flex items-start justify-between gap-8">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-tight">
            {timeGreeting()}
            {firstName ? `, ${firstName}` : ''}.
          </h1>
          <p className="mt-0.5 text-[13.5px] text-ink-muted">
            {new Intl.DateTimeFormat('en-IN', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            }).format(new Date())}
          </p>
          <p className="font-display mt-3 border-l-2 border-[var(--sunrise)] pl-3 text-[15px] italic leading-snug">
            {quote.text}
            <span className="ml-2 whitespace-nowrap text-[12px] font-medium not-italic text-ink-faint">
              — {quote.by}
            </span>
          </p>
        </div>
        {/* Day progress lives up here on desktop; mobile keeps its card below */}
        <div className="hidden shrink-0 lg:block">
          <ProgressRing done={doneCount} total={todaysTasks.length} />
        </div>
      </div>

      {/* Quick capture — fastest input in the app */}
      {on.has('capture') && (
        <div className="mb-5">
          <CaptureBar />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left column: tasks, inbox, projects (fills the space under tasks on desktop) */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-tide-soft text-tide">
                  <ListTodo size={13} />
                </span>
                <h2 className="text-[14px] font-semibold">Today’s tasks</h2>
              </div>
              {on.has('todos') && (
                <Link
                  to="/todos"
                  className="flex items-center gap-1 text-[12.5px] font-medium text-tide hover:underline"
                >
                  All todos <ArrowRight size={13} />
                </Link>
              )}
            </div>
            {todaysTasks.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13.5px] text-ink-faint">
                Nothing on today’s agenda.{' '}
                <Link to="/todos" className="font-medium text-tide hover:underline">
                  Pin a Day list
                </Link>{' '}
                to bring its tasks here.
              </div>
            ) : (
              <ul className="py-1.5">
                {openTasks.map((t) => (
                  <DashTask key={t.id} todo={t} leftover={isLeftover(t, dayListIds)} />
                ))}
                {openTasks.length === 0 && (
                  <li className="px-4 py-6 text-center text-[13.5px] font-medium text-pos">
                    All done for today. The cove is calm. 🌊
                  </li>
                )}
              </ul>
            )}
          </Card>

          {/* Unsorted captures (hides itself when empty) */}
          {on.has('capture') && <InboxCard />}

          {/* Mobile keeps the progress card; desktop shows the ring beside the greeting */}
          <Card className="px-4 py-4 lg:hidden">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-pos-soft text-pos">
                <CalendarCheck size={13} />
              </span>
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
                Day progress
              </h2>
            </div>
            <ProgressRing done={doneCount} total={todaysTasks.length} />
          </Card>

          {/* Projects (also the mobile entry point — bottom nav is full) */}
          {on.has('projects') && <ProjectsCard />}
        </div>

        {/* Right rail */}
        <div className="flex flex-col gap-4">
          {on.has('streaks') && <StreaksCard />}

          {on.has('finance') && (
          <Card className="px-4 py-4">
            <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-awaited-soft text-awaited">
                <BellRing size={13} />
              </span>
              Follow-ups due
            </h2>
            {dueFollowUps.length === 0 ? (
              <p className="text-[13px] text-ink-faint">None due today.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {dueFollowUps.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-2 text-[13.5px]">
                    <span className="min-w-0">
                      {/* What it's for, then who it's from. */}
                      <span className="block truncate">{p.note || p.counterparty}</span>
                      {p.note && (
                        <span className="block truncate text-[12px] text-ink-faint">
                          from {p.counterparty}
                        </span>
                      )}
                    </span>
                    <span className="tnum shrink-0 font-semibold">{money(Number(p.amount))}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              to="/finance"
              className="mt-3 flex items-center gap-1 text-[12.5px] font-medium text-tide hover:underline"
            >
              Finance <ArrowRight size={13} />
            </Link>
          </Card>
          )}

          {on.has('keydates') && <KeyDatesCard />}
          {/* The mobile escape-hatch link row that used to live here is gone —
              the drawer now reaches every page (and it was missing /stats). */}
        </div>
      </div>
    </div>
  )
}

function ProjectsCard() {
  const { data: projects = [] } = useRows<Project>('projects', { column: 'name' })
  const active = projects.filter((p) => !p.archived_at)

  return (
    <Card className="px-4 py-4">
      <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-sunrise-soft text-sunrise">
          <FolderKanban size={13} />
        </span>
        Projects
      </h2>
      {active.length === 0 ? (
        <p className="text-[13px] text-ink-faint">No active projects — add one from the sidebar.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {active.map((p) => (
            <li key={p.id}>
              <Link
                to={`/projects/${p.id}`}
                className="flex items-center justify-between rounded-field px-2 py-1.5 text-[13.5px] font-medium hover:bg-sunken"
              >
                <span className="truncate">{p.name}</span>
                <ArrowRight size={13} className="shrink-0 text-ink-faint" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function DashTask({ todo, leftover }: { todo: Todo; leftover?: boolean }) {
  const update = useUpdate<Todo>('todos')
  return (
    <li className="flex items-start gap-2.5 px-4 py-1.5">
      <TaskCheck
        checked={todo.done}
        onChange={(next) =>
          update.mutate({
            id: todo.id,
            patch: {
              done: next,
              completed_at: next ? new Date().toISOString() : null,
            },
          })
        }
        label={`Mark “${todo.title}” done`}
      />
      <QuadrantPicker todo={todo} />
      <div className="min-w-0 flex-1">
        <TaskText text={todo.title} />
      </div>
      {leftover && (
        <span className="mt-0.5 shrink-0 rounded-full bg-awaited-soft px-2 py-0.5 text-[10.5px] font-semibold text-awaited">
          From earlier
        </span>
      )}
      {todo.scheduled_at && (
        <span className="tnum mt-0.5 shrink-0 text-[12px] text-tide">
          {new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(
            new Date(todo.scheduled_at),
          )}
        </span>
      )}
    </li>
  )
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  const r = 30
  const c = 2 * Math.PI * r

  return (
    <div className="mt-3 flex items-center gap-4">
      <svg width="76" height="76" viewBox="0 0 76 76" className="shrink-0 -rotate-90">
        <circle cx="38" cy="38" r={r} fill="none" strokeWidth="7" className="stroke-[var(--surface-sunken)]" />
        <circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          className={`transition-all duration-700 ${pct === 100 ? 'stroke-[var(--pos)]' : 'stroke-[var(--tide)]'}`}
        />
      </svg>
      <div>
        <div className="tnum text-[24px] font-semibold tracking-tight">
          {done}
          <span className="text-[14px] font-medium text-ink-faint">/{total}</span>
        </div>
        <div className="text-[12.5px] text-ink-muted">
          {total === 0 ? 'No tasks yet' : pct === 100 ? 'All clear' : `${pct}% through the day`}
        </div>
      </div>
    </div>
  )
}
