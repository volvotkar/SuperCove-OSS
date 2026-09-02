import { useMemo, useState } from 'react'
import { CalendarCheck, CalendarClock, Check, History, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { useDelete, useInsert, useRows, useUpdate } from '../lib/data'
import { useNavigate } from 'react-router-dom'
import type { Note, Todo, TodoList } from '../lib/types'
import { todayISO } from '../lib/format'
import { dayListIdSet, isActive, isLeftover } from '../lib/rollover'
import { quadrantWeight } from '../lib/matrix'
import { unlinkTaskEvent, updateCalendarEvent } from '../lib/gcal'
import { QuadrantPicker } from '../features/todos/QuadrantPicker'
import { TaskText } from '../features/todos/TaskText'
import { Button, Card, CharCount, EmptyState, Input, PageHeader, TaskCheck } from '../components/ui'
import { ScheduleModal } from '../features/todos/ScheduleModal'

/** Row actions stay visible on touch; hover-reveal only from `sm` up. */
const ROW_ACTION =
  'grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-faint transition-all sm:opacity-0 sm:group-hover:opacity-100'

const SECTIONS = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'goals', label: 'General Goals' },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

export function Todos() {
  const [section, setSection] = useState<SectionId>('day')
  const { data: lists = [] } = useRows<TodoList>('todo_lists', { column: 'position' })
  const { data: todos = [] } = useRows<Todo>('todos', { column: 'position' })
  const insertList = useInsert<TodoList>('todo_lists')
  const [scheduling, setScheduling] = useState<Todo | null>(null)
  const [namingList, setNamingList] = useState(false)
  const [newListName, setNewListName] = useState('')

  const sectionLists = useMemo(
    () => lists.filter((l) => l.section === section),
    [lists, section],
  )

  // All Day lists, pinned or not — leftovers must not depend on the agenda pin.
  const leftovers = useMemo(() => {
    const dayIds = dayListIdSet(lists)
    return todos.filter((t) => isLeftover(t, dayIds))
  }, [lists, todos])

  function addList(e: React.FormEvent) {
    e.preventDefault()
    const name = newListName.trim()
    if (!name) return
    insertList.mutate(
      { section, name, position: sectionLists.length },
      {
        onSuccess: () => {
          setNewListName('')
          setNamingList(false)
        },
      },
    )
  }

  return (
    <div>
      <PageHeader
        title="Todos"
        action={
          <Button onClick={() => setNamingList((v) => !v)}>
            <Plus size={15} /> List
          </Button>
        }
      />

      {namingList && (
        <form onSubmit={addList} className="mb-4 flex gap-2">
          <Input
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder={`New list in ${SECTIONS.find((s) => s.id === section)!.label}…`}
            autoFocus
            className="max-w-xs"
          />
          <CharCount value={newListName} />
          <Button type="submit" disabled={insertList.isPending}>
            Add
          </Button>
          {insertList.isError && (
            <p className="self-center text-[12px] text-neg">{insertList.error.message}</p>
          )}
        </form>
      )}

      {/* Section switcher */}
      <div className="mb-5 flex w-fit rounded-field border border-line bg-surface p-0.5">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={`rounded-[7px] px-3.5 py-1.5 text-[13.5px] font-medium transition-colors ${
              section === s.id ? 'bg-tide text-tide-ink' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === 'day' && leftovers.length > 0 && (
        <LeftoverBanner leftovers={leftovers} lists={lists} />
      )}

      {sectionLists.length === 0 ? (
        <EmptyState>
          No lists in {SECTIONS.find((s) => s.id === section)!.label} yet — add one to start.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {sectionLists.map((list) => (
            <ListCard
              key={list.id}
              list={list}
              todos={todos.filter((t) => t.list_id === list.id)}
              onSchedule={setScheduling}
            />
          ))}
        </div>
      )}

      {scheduling && <ScheduleModal todo={scheduling} onClose={() => setScheduling(null)} />}
    </div>
  )
}

function LeftoverBanner({ leftovers, lists }: { leftovers: Todo[]; lists: TodoList[] }) {
  const update = useUpdate<Todo>('todos')
  const updateList = useUpdate<TodoList>('todo_lists')
  const del = useDelete('todos')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Bring leftovers forward: stamp `carried_on` (rather than rewriting
   * `created_at` and destroying the task's real age) and pin the lists they
   * live on to today, so carrying over actually puts the work on the agenda.
   */
  async function carryOverAll() {
    setBusy(true)
    setError(null)
    const today = todayISO()
    const listIds = [...new Set(leftovers.map((t) => t.list_id))]
    try {
      await Promise.all([
        ...leftovers.map(
          (t) =>
            new Promise<void>((resolve, reject) =>
              update.mutate({ id: t.id, patch: { carried_on: today } }, { onSuccess: () => resolve(), onError: reject }),
            ),
        ),
        ...listIds
          .filter((id) => lists.find((l) => l.id === id)?.agenda_on !== today)
          .map(
            (id) =>
              new Promise<void>((resolve, reject) =>
                updateList.mutate({ id, patch: { agenda_on: today } }, { onSuccess: () => resolve(), onError: reject }),
              ),
          ),
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not carry these over.')
    } finally {
      setBusy(false)
    }
  }

  async function dropAll() {
    if (!window.confirm(`Drop ${leftovers.length === 1 ? 'this task' : `all ${leftovers.length} tasks`}? They’ll be deleted.`)) return
    setBusy(true)
    // Clear their calendar events first — once the rows are gone the event ids
    // are unrecoverable.
    await Promise.all(leftovers.map((t) => unlinkTaskEvent(t.gcal_event_id)))
    await Promise.all(
      leftovers.map((t) => new Promise((resolve) => del.mutate(t.id, { onSettled: resolve }))),
    )
    setBusy(false)
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-card border border-line bg-awaited-soft px-4 py-3">
      <History size={15} className="shrink-0 text-awaited" />
      <p className="min-w-0 flex-1 text-[13.5px] font-medium text-awaited">
        {leftovers.length === 1 ? '1 task' : `${leftovers.length} tasks`} left over from before today.
      </p>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          onClick={carryOverAll}
          disabled={busy}
          title="Move them to today and pin their list to today’s agenda"
          className="px-3 py-1.5 text-[13px]"
        >
          Carry over
        </Button>
        <Button variant="danger" onClick={dropAll} disabled={busy} className="px-3 py-1.5 text-[13px]">
          Drop
        </Button>
      </div>
      {error && <p className="w-full text-[12.5px] text-neg">{error}</p>}
    </div>
  )
}

export function ListCard({
  list,
  todos,
  onSchedule,
}: {
  list: TodoList
  todos: Todo[]
  onSchedule: (t: Todo) => void
}) {
  const insert = useInsert<Todo>('todos')
  const insertNote = useInsert<Note>('notes')
  const updateList = useUpdate<TodoList>('todo_lists')
  const delList = useDelete('todo_lists')
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(list.name)

  const onAgenda = list.agenda_on === todayISO()

  const open = todos
    .filter(isActive)
    .sort((a, b) => quadrantWeight(a.priority) - quadrantWeight(b.priority) || a.position - b.position)
  const done = todos.filter((t) => t.done && !t.cancelled_at)
  // Crossed-out tasks sink to the bottom — still there, clearly out of play.
  const cancelled = todos.filter((t) => t.cancelled_at)

  function addTodo(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    // Clear the field only once the row is really in — a failed insert used to
    // swallow both the error and the text the user just typed.
    insert.mutate(
      { list_id: list.id, title: title.trim(), position: todos.length },
      { onSuccess: () => setTitle('') },
    )
  }

  function commitRename(e: React.FormEvent) {
    e.preventDefault()
    const next = draftName.trim()
    if (!next || next === list.name) return setRenaming(false)
    updateList.mutate({ id: list.id, patch: { name: next } }, { onSuccess: () => setRenaming(false) })
  }

  async function removeList() {
    if (!window.confirm(`Delete “${list.name}” and its tasks?`)) return
    // The DB cascades the todos away, so their calendar events have to go first
    // — after the delete the event ids are gone for good.
    await Promise.all(todos.map((t) => unlinkTaskEvent(t.gcal_event_id)))
    delList.mutate(list.id)
  }

  return (
    <Card className="flex flex-col">
      <div className="group flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        {renaming ? (
          <form onSubmit={commitRename} className="flex min-w-0 flex-1 items-center gap-1.5">
            <Input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setDraftName(list.name)
                  setRenaming(false)
                }
              }}
              autoFocus
              className="py-1 text-[14px] font-semibold"
            />
            <button type="submit" title="Save name" className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-pos hover:bg-pos-soft">
              <Check size={14} />
            </button>
            <button
              type="button"
              title="Cancel"
              onClick={() => {
                setDraftName(list.name)
                setRenaming(false)
              }}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-sunken"
            >
              <X size={14} />
            </button>
          </form>
        ) : (
          <>
            <h3 className="min-w-0 truncate text-[14px] font-semibold">{list.name}</h3>
            <div className="flex items-center gap-1.5">
              {list.section === 'day' && (
                <button
                  type="button"
                  title={
                    onAgenda
                      ? 'On today’s agenda — tap to remove'
                      : 'Show this list’s tasks in Today'
                  }
                  onClick={() =>
                    updateList.mutate({
                      id: list.id,
                      patch: { agenda_on: onAgenda ? null : todayISO() },
                    })
                  }
                  className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium transition-colors ${
                    onAgenda
                      ? 'bg-tide-soft text-tide'
                      : 'border border-line text-ink-muted hover:border-line-strong hover:text-ink'
                  }`}
                >
                  <CalendarCheck size={11} />
                  {onAgenda ? 'On today' : 'Add to today'}
                </button>
              )}
              <span className="text-[12px] text-ink-faint">
                {open.length ? `${open.length} open` : done.length ? 'All done' : ''}
              </span>
              <button
                type="button"
                title="Rename list"
                onClick={() => {
                  setDraftName(list.name)
                  setRenaming(true)
                }}
                className={`${ROW_ACTION} hover:bg-sunken hover:text-ink`}
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                title="Delete list"
                onClick={removeList}
                className={`${ROW_ACTION} hover:bg-neg-soft hover:text-neg`}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </>
        )}
      </div>

      <ul className="flex-1 py-1">
        {open.map((t) => (
          <TodoRow key={t.id} todo={t} onSchedule={onSchedule} />
        ))}
        {done.map((t) => (
          <TodoRow key={t.id} todo={t} onSchedule={onSchedule} />
        ))}
        {cancelled.map((t) => (
          <TodoRow key={t.id} todo={t} onSchedule={onSchedule} />
        ))}
      </ul>

      <form onSubmit={addTodo} className="border-t border-line px-2 py-1.5">
        <div className="flex items-center gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a task…"
            className="border-none bg-transparent px-2 focus:border-none"
          />
          <CharCount value={title} />
        </div>
        {/* Past the soft limit this isn't a task any more, it's a paragraph. */}
        {title.length > 180 && (
          <div className="flex items-center gap-2 px-2 pb-1.5">
            <p className="text-[12px] text-ink-faint">That’s long for a task.</p>
            <button
              type="button"
              disabled={insertNote.isPending}
              onClick={() =>
                insertNote.mutate(
                  {
                    name: title.trim().slice(0, 60),
                    content: title.trim(),
                    project_id: null,
                    position: 0,
                  },
                  {
                    onSuccess: (n) => {
                      setTitle('')
                      navigate(`/notes/${n.id}`)
                    },
                  },
                )
              }
              className="text-[12px] font-medium text-tide hover:underline disabled:opacity-50"
            >
              Make it a note instead
            </button>
          </div>
        )}
        {insert.isError && (
          <p className="px-2 pb-1 text-[12px] text-neg">
            Couldn’t add that task: {insert.error.message}
          </p>
        )}
      </form>
    </Card>
  )
}

function TodoRow({ todo, onSchedule }: { todo: Todo; onSchedule: (t: Todo) => void }) {
  const update = useUpdate<Todo>('todos')
  const del = useDelete('todos')
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(todo.title)

  function commitRename(e: React.FormEvent) {
    e.preventDefault()
    const next = draft.trim()
    if (!next || next === todo.title) return setRenaming(false)
    update.mutate(
      { id: todo.id, patch: { title: next } },
      {
        onSuccess: () => {
          setRenaming(false)
          // Keep the calendar event's title in step with the task.
          if (todo.gcal_event_id && todo.scheduled_at) {
            void updateCalendarEvent(todo.gcal_event_id, {
              summary: next,
              startISO: todo.scheduled_at,
              durationMins: todo.scheduled_duration_mins ?? 30,
            }).catch(() => {})
          }
        },
      },
    )
  }

  async function removeTodo() {
    await unlinkTaskEvent(todo.gcal_event_id)
    del.mutate(todo.id)
  }

  /**
   * Cross out / restore. Cancelling pulls the task off the calendar too —
   * restoring brings the task back but deliberately not the event, since we
   * can't know the old slot is still free.
   */
  async function toggleCancelled() {
    if (todo.cancelled_at) {
      update.mutate({ id: todo.id, patch: { cancelled_at: null } })
      return
    }
    await unlinkTaskEvent(todo.gcal_event_id)
    update.mutate({
      id: todo.id,
      patch: { cancelled_at: new Date().toISOString(), gcal_event_id: null },
    })
  }

  const scheduledLabel = todo.scheduled_at
    ? new Intl.DateTimeFormat('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(todo.scheduled_at))
    : null

  const crossed = !!todo.cancelled_at

  return (
    <li className={`group flex items-start gap-2.5 px-4 py-1.5 ${crossed ? 'opacity-60' : ''}`}>
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
        label={`Mark “${todo.title}” ${todo.done ? 'open' : 'done'}`}
      />
      {!todo.done && !crossed && <QuadrantPicker todo={todo} />}
      <div className="min-w-0 flex-1">
        {renaming ? (
          <form onSubmit={commitRename} className="flex items-center gap-1.5">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setDraft(todo.title)
                  setRenaming(false)
                }
              }}
              autoFocus
              className="py-1 text-[14px]"
            />
            <CharCount value={draft} />
            <button type="submit" title="Save" className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-pos hover:bg-pos-soft">
              <Check size={14} />
            </button>
            <button
              type="button"
              title="Cancel"
              onClick={() => {
                setDraft(todo.title)
                setRenaming(false)
              }}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-sunken"
            >
              <X size={14} />
            </button>
          </form>
        ) : (
          <>
            {/* Truncated by default; chevron expands. Text click still schedules. */}
            <TaskText
              text={todo.title}
              done={todo.done || crossed}
              onClick={todo.done || crossed ? undefined : () => onSchedule(todo)}
              clickTitle={todo.done || crossed ? undefined : 'Schedule on Google Calendar'}
            />
            {crossed && (
              <span className="mt-0.5 inline-block rounded-full bg-sunken px-1.5 py-0.5 text-[10.5px] font-medium text-ink-faint">
                Crossed out
              </span>
            )}
            {scheduledLabel && !todo.done && !crossed && (
              <div className="flex items-center gap-1 text-[11.5px] text-tide">
                <CalendarClock size={11} />
                {scheduledLabel}
                {!todo.gcal_event_id && <span className="text-ink-faint">(not linked yet)</span>}
              </div>
            )}
          </>
        )}
      </div>
      {!renaming && (
        <>
          <button
            type="button"
            title={crossed ? 'Bring this task back' : 'Cross out (postponed or cancelled)'}
            onClick={toggleCancelled}
            className={`${ROW_ACTION} hover:bg-sunken hover:text-ink`}
          >
            {crossed ? <RotateCcw size={13} /> : <X size={14} />}
          </button>
          <button
            type="button"
            title="Rename task"
            onClick={() => {
              setDraft(todo.title)
              setRenaming(true)
            }}
            className={`${ROW_ACTION} hover:bg-sunken hover:text-ink`}
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            title="Delete task"
            onClick={removeTodo}
            className={`${ROW_ACTION} hover:bg-neg-soft hover:text-neg`}
          >
            <Trash2 size={13} />
          </button>
        </>
      )}
    </li>
  )
}
