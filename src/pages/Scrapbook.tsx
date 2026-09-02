import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, LayoutDashboard, Plus, Trash2 } from 'lucide-react'
import { useDelete, useInsert, useRows, useUpdate } from '../lib/data'
import type { Scrapbook as Board, ScrapbookItem } from '../lib/types'
import { Canvas } from '../features/scrapbook/Canvas'
import { InlineRename } from '../components/InlineRename'
import { Button, Card, CharCount, EmptyState, Input, PageHeader } from '../components/ui'

/**
 * Free-form boards: paste screenshots, drop in text and headings, arrange them
 * however you like. Deliberately simpler than the notes editor — no markdown,
 * no autosave debounce beyond the per-block writes.
 */
export function Scrapbook() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: boards = [] } = useRows<Board>('scrapbooks', {
    column: 'updated_at',
    ascending: false,
  })
  const { data: items = [] } = useRows<ScrapbookItem>('scrapbook_items', { column: 'z' })
  const insert = useInsert<Board>('scrapbooks')
  const update = useUpdate<Board>('scrapbooks')
  const del = useDelete('scrapbooks')

  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const open = id ? boards.find((b) => b.id === id) : null

  function create(e: React.FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    insert.mutate(
      { name: n },
      {
        onSuccess: (b) => {
          setName('')
          setNaming(false)
          navigate(`/scrapbook/${b.id}`)
        },
      },
    )
  }

  // ---- One board ------------------------------------------------------------
  if (id) {
    if (!open) return <EmptyState>That board doesn’t exist any more.</EmptyState>
    return (
      <div>
        <PageHeader
          title={
            <InlineRename
              value={open.name}
              onRename={(next) => update.mutate({ id: open.id, patch: { name: next } })}
              title="Click to rename this board"
              className="font-display text-xl font-semibold tracking-tight"
            />
          }
          action={
            <Button variant="ghost" onClick={() => navigate('/scrapbook')}>
              <ArrowLeft size={15} /> All boards
            </Button>
          }
        />
        <Canvas scrapbookId={open.id} />
      </div>
    )
  }

  // ---- Gallery --------------------------------------------------------------
  return (
    <div>
      <PageHeader
        title="Scrapbook"
        action={
          <Button onClick={() => setNaming((v) => !v)}>
            <Plus size={15} /> Board
          </Button>
        }
      />

      {naming && (
        <form onSubmit={create} className="mb-4 flex flex-wrap items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Board name…"
            autoFocus
            className="max-w-xs"
          />
          <CharCount value={name} warn={40} limit={80} />
          <Button type="submit" disabled={insert.isPending}>
            Create
          </Button>
          {insert.isError && <p className="text-[12px] text-neg">{insert.error.message}</p>}
        </form>
      )}

      {boards.length === 0 ? (
        <EmptyState>No boards yet — make one and paste a screenshot into it.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {boards.map((b) => {
            const count = items.filter((i) => i.scrapbook_id === b.id).length
            return (
              <Card key={b.id} className="group flex items-center gap-3 px-4 py-4">
                <button
                  type="button"
                  onClick={() => navigate(`/scrapbook/${b.id}`)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sunrise-soft text-sunrise">
                    <LayoutDashboard size={15} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold">{b.name}</span>
                    <span className="block text-[12px] text-ink-faint">
                      {count === 0 ? 'Empty' : count === 1 ? '1 block' : `${count} blocks`}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  title="Delete board"
                  onClick={() => {
                    if (window.confirm(`Delete “${b.name}” and everything on it?`)) del.mutate(b.id)
                  }}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint transition-all hover:bg-neg-soft hover:text-neg sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
