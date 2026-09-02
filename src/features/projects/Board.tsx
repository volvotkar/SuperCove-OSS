import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useDelete, useInsert, useRows, useUpdate } from '../../lib/data'
import type { KanbanCard, KanbanColumn } from '../../lib/types'
import { Button, Input } from '../../components/ui'

export function Board({ projectId }: { projectId: string }) {
  const { data: allColumns = [] } = useRows<KanbanColumn>('kanban_columns', { column: 'position' })
  const { data: allCards = [] } = useRows<KanbanCard>('kanban_cards', { column: 'position' })
  const insertColumn = useInsert<KanbanColumn>('kanban_columns')
  const [addingColumn, setAddingColumn] = useState(false)
  const [columnName, setColumnName] = useState('')

  const columns = allColumns.filter((c) => c.project_id === projectId)

  function addColumn(e: React.FormEvent) {
    e.preventDefault()
    if (!columnName.trim()) return
    insertColumn.mutate(
      { project_id: projectId, name: columnName.trim(), position: columns.length },
      {
        onSuccess: () => {
          setColumnName('')
          setAddingColumn(false)
        },
      },
    )
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        {addingColumn ? (
          <form onSubmit={addColumn} className="flex gap-2">
            <Input
              value={columnName}
              onChange={(e) => setColumnName(e.target.value)}
              placeholder="Column name…"
              autoFocus
              className="max-w-[200px]"
            />
            <Button type="submit">Add</Button>
          </form>
        ) : (
          <Button variant="ghost" onClick={() => setAddingColumn(true)}>
            <Plus size={15} /> Column
          </Button>
        )}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((col, i) => (
          <Column
            key={col.id}
            column={col}
            cards={allCards.filter((c) => c.column_id === col.id)}
            left={columns[i - 1]?.id}
            right={columns[i + 1]?.id}
          />
        ))}
      </div>
    </div>
  )
}

function Column({
  column,
  cards,
  left,
  right,
}: {
  column: KanbanColumn
  cards: KanbanCard[]
  left?: string
  right?: string
}) {
  const insert = useInsert<KanbanCard>('kanban_cards')
  const delColumn = useDelete('kanban_columns')
  const [title, setTitle] = useState('')

  function addCard(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    insert.mutate({ column_id: column.id, title: title.trim(), position: cards.length })
    setTitle('')
  }

  return (
    <div className="flex w-[260px] shrink-0 flex-col rounded-card border border-line bg-sunken">
      <div className="group flex items-center justify-between px-3 py-2.5">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
          {column.name}
          <span className="ml-1.5 font-normal text-ink-faint">{cards.length}</span>
        </h3>
        <button
          type="button"
          title="Delete column"
          onClick={() => {
            if (cards.length === 0 || window.confirm(`Delete “${column.name}” and its ${cards.length} cards?`))
              delColumn.mutate(column.id)
          }}
          className="grid h-6 w-6 place-items-center rounded-full text-ink-faint transition-all sm:opacity-0 hover:bg-neg-soft hover:text-neg sm:group-hover:opacity-100"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div className="flex flex-col gap-2 px-2 pb-2">
        {cards.map((card) => (
          <CardItem key={card.id} card={card} left={left} right={right} />
        ))}
      </div>

      <form onSubmit={addCard} className="px-2 pb-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a card…"
          className="border-dashed bg-transparent text-[13.5px]"
        />
      </form>
    </div>
  )
}

function CardItem({ card, left, right }: { card: KanbanCard; left?: string; right?: string }) {
  const update = useUpdate<KanbanCard>('kanban_cards')
  const del = useDelete('kanban_cards')

  const move = (columnId: string) => update.mutate({ id: card.id, patch: { column_id: columnId } })

  return (
    <div className="group rounded-field border border-line bg-surface px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="text-[13.5px] leading-snug">{card.title}</div>
      <div className="mt-1.5 flex items-center justify-between transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
        <button
          type="button"
          disabled={!left}
          onClick={() => left && move(left)}
          className="grid h-6 w-6 place-items-center rounded-full text-ink-faint hover:bg-sunken disabled:invisible"
          aria-label="Move left"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          type="button"
          onClick={() => del.mutate(card.id)}
          className="grid h-6 w-6 place-items-center rounded-full text-ink-faint hover:bg-neg-soft hover:text-neg"
          aria-label="Delete card"
        >
          <Trash2 size={13} />
        </button>
        <button
          type="button"
          disabled={!right}
          onClick={() => right && move(right)}
          className="grid h-6 w-6 place-items-center rounded-full text-ink-faint hover:bg-sunken disabled:invisible"
          aria-label="Move right"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
