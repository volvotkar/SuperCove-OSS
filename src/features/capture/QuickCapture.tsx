import { useState } from 'react'
import { Inbox, ListPlus, Trash2, Zap } from 'lucide-react'
import { useDelete, useInsert, useRows } from '../../lib/data'
import type { Todo, TodoList } from '../../lib/types'
import { Button, Card, Modal, Select } from '../../components/ui'
import { TaskText } from '../todos/TaskText'

type InboxItem = { id: string; content: string; created_at: string }

/**
 * Quick Capture: dump a thought in two seconds, sort it later.
 * The bar inserts into inbox_items; the inbox card lets each item become a
 * task in any list (or get deleted) when there's time to think.
 */
export function CaptureBar() {
  const insert = useInsert<InboxItem>('inbox_items')
  const [text, setText] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    insert.mutate({ content: text.trim() })
    setText('')
  }

  return (
    <form onSubmit={submit} className="relative">
      <Zap
        size={16}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-tide"
      />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Capture anything — sort it out later…"
        className="w-full rounded-card border border-line bg-surface py-3 pl-10 pr-24 text-[14px] shadow-[0_1px_2px_rgba(0,0,0,0.03)] placeholder:text-ink-faint focus:border-tide"
      />
      <button
        type="submit"
        disabled={!text.trim() || insert.isPending}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-field bg-tide px-3 py-1.5 text-[12.5px] font-semibold text-tide-ink transition-opacity disabled:opacity-0"
      >
        Capture
      </button>
    </form>
  )
}

export function InboxCard() {
  const { data: items = [] } = useRows<InboxItem>('inbox_items', { column: 'created_at', ascending: false })
  const del = useDelete('inbox_items')
  const [sorting, setSorting] = useState<InboxItem | null>(null)

  if (items.length === 0) return null

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-tide-soft text-tide">
          <Inbox size={13} />
        </span>
        <h2 className="text-[14px] font-semibold">Inbox</h2>
        <span className="text-[12px] text-ink-faint">{items.length} to sort</span>
      </div>
      <ul className="py-1">
        {items.map((item) => (
          <li key={item.id} className="group flex items-start gap-2 px-4 py-1.5">
            <div className="min-w-0 flex-1 pt-0.5">
              <TaskText text={item.content} />
            </div>
            <button
              type="button"
              onClick={() => setSorting(item)}
              title="Make it a task"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-tide-soft text-tide transition-colors hover:opacity-90"
            >
              <ListPlus size={14} />
            </button>
            <button
              type="button"
              onClick={() => del.mutate(item.id)}
              title="Discard"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint transition-all hover:bg-neg-soft hover:text-neg sm:opacity-0 sm:group-hover:opacity-100"
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      {sorting && <SortModal item={sorting} onClose={() => setSorting(null)} />}
    </Card>
  )
}

function SortModal({ item, onClose }: { item: InboxItem; onClose: () => void }) {
  const { data: lists = [] } = useRows<TodoList>('todo_lists', { column: 'position' })
  const insertTodo = useInsert<Todo>('todos')
  const delItem = useDelete('inbox_items')
  const [listId, setListId] = useState('')

  const sectionLabel: Record<string, string> = {
    day: 'Day',
    week: 'Week',
    month: 'Month',
    goals: 'General Goals',
    project: 'Project',
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!listId) return
    insertTodo.mutate(
      { list_id: listId, title: item.content },
      {
        onSuccess: () => {
          delItem.mutate(item.id)
          onClose()
        },
      },
    )
  }

  return (
    <Modal title="Make it a task" onClose={onClose}>
      <p className="mb-4 rounded-field bg-sunken px-3 py-2 text-[13.5px]">{item.content}</p>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <Select value={listId} onChange={(e) => setListId(e.target.value)} required>
          <option value="">Choose a list…</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {sectionLabel[l.section]} · {l.name}
            </option>
          ))}
        </Select>
        <Button type="submit" disabled={!listId || insertTodo.isPending}>
          {insertTodo.isPending ? 'Moving…' : 'Add to list'}
        </Button>
      </form>
    </Modal>
  )
}
