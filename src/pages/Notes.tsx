import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileText, Plus, Search } from 'lucide-react'
import { useDelete, useInsert, useRows, useUpdate } from '../lib/data'
import type { Note, Project } from '../lib/types'
import { NoteEditor } from '../features/projects/NotesTab'
import { Button, Card, CharCount, EmptyState, Input, PageHeader, Select } from '../components/ui'
import { InlineRename } from '../components/InlineRename'

/**
 * Every note in the app, in one gallery — across projects plus the
 * project-less "Miscellaneous" bucket (project_id is null).
 *
 * No new query: `notes` is already fetched whole and cached, so filtering here
 * is purely client-side and the project Notes tab stays in sync automatically.
 */

const MISC = 'misc'

/** Rough markdown → plain text, just for card previews. */
function plainPreview(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const relFmt = new Intl.RelativeTimeFormat('en-IN', { numeric: 'auto' })

function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60_000)
  if (Math.abs(mins) < 60) return relFmt.format(-mins, 'minute')
  const hrs = Math.round(mins / 60)
  if (Math.abs(hrs) < 24) return relFmt.format(-hrs, 'hour')
  return relFmt.format(-Math.round(hrs / 24), 'day')
}

export function Notes() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: notes = [] } = useRows<Note>('notes', { column: 'updated_at', ascending: false })
  const { data: projects = [] } = useRows<Project>('projects', { column: 'name' })
  const insert = useInsert<Note>('notes')
  const update = useUpdate<Note>('notes')
  const del = useDelete('notes')

  const [scope, setScope] = useState<string>('all')
  const [q, setQ] = useState('')
  const [naming, setNaming] = useState(false)
  const [newName, setNewName] = useState('')

  const projectName = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  )

  const open = id ? notes.find((n) => n.id === id) : null

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return notes.filter((n) => {
      if (scope === MISC && n.project_id !== null) return false
      if (scope !== 'all' && scope !== MISC && n.project_id !== scope) return false
      if (!needle) return true
      return (
        n.name.toLowerCase().includes(needle) || n.content.toLowerCase().includes(needle)
      )
    })
  }, [notes, scope, q])

  function createNote(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    // New notes land in Miscellaneous unless a project is being filtered on.
    const project_id = scope !== 'all' && scope !== MISC ? scope : null
    insert.mutate(
      { name, project_id, position: notes.length },
      {
        onSuccess: (n) => {
          setNewName('')
          setNaming(false)
          navigate(`/notes/${n.id}`)
        },
      },
    )
  }

  // ---- Single note view -----------------------------------------------------
  if (id) {
    if (!open) return <EmptyState>That note doesn’t exist any more.</EmptyState>
    return (
      <div>
        <PageHeader
          title={
            <InlineRename
              value={open.name}
              onRename={(name) => update.mutate({ id: open.id, patch: { name } })}
              title="Click to rename this note"
              className="font-display text-xl font-semibold tracking-tight"
            />
          }
          action={
            <Button variant="ghost" onClick={() => navigate('/notes')}>
              <ArrowLeft size={15} /> All notes
            </Button>
          }
        />
        <NoteEditor
          key={open.id}
          note={open}
          onDelete={() => del.mutate(open.id, { onSuccess: () => navigate('/notes') })}
          toolbarExtra={
            <label className="flex items-center gap-1.5 text-[11.5px] text-ink-faint">
              In
              <span className="w-40">
                <Select
                  value={open.project_id ?? MISC}
                  onChange={(e) =>
                    update.mutate({
                      id: open.id,
                      patch: { project_id: e.target.value === MISC ? null : e.target.value },
                    })
                  }
                  className="py-1 text-[12.5px]"
                >
                  <option value={MISC}>Miscellaneous</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </span>
            </label>
          }
        />
      </div>
    )
  }

  // ---- Gallery --------------------------------------------------------------
  return (
    <div>
      <PageHeader
        title="Notes"
        action={
          <Button onClick={() => setNaming((v) => !v)}>
            <Plus size={15} /> Note
          </Button>
        }
      />

      {naming && (
        <form onSubmit={createNote} className="mb-4 flex flex-wrap items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Note name…"
            autoFocus
            className="max-w-xs"
          />
          <CharCount value={newName} warn={40} limit={80} />
          <Button type="submit" disabled={insert.isPending}>
            Create
          </Button>
          {insert.isError && <p className="text-[12px] text-neg">{insert.error.message}</p>}
        </form>
      )}

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes…"
            className="pl-8"
          />
        </span>
        <span className="w-48">
          <Select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">All notes</option>
            <option value={MISC}>Miscellaneous</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </span>
        <span className="text-[12.5px] text-ink-faint">
          {filtered.length} {filtered.length === 1 ? 'note' : 'notes'}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState>
          {q || scope !== 'all'
            ? 'No notes match that.'
            : 'No notes yet — create one and it lands in Miscellaneous.'}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((n) => {
            const preview = plainPreview(n.content)
            return (
              <Card
                key={n.id}
                className="flex cursor-pointer flex-col px-4 py-4 transition-colors hover:border-line-strong"
              >
                <button
                  type="button"
                  onClick={() => navigate(`/notes/${n.id}`)}
                  className="flex flex-1 flex-col text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-tide-soft text-tide">
                      <FileText size={13} />
                    </span>
                    <h3 className="min-w-0 truncate text-[14px] font-semibold">{n.name}</h3>
                  </div>
                  <p className="mt-2 line-clamp-3 flex-1 text-[13px] leading-relaxed text-ink-muted">
                    {preview || 'Empty note.'}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="truncate rounded-full bg-sunken px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                      {n.project_id ? (projectName.get(n.project_id) ?? 'Project') : 'Miscellaneous'}
                    </span>
                    <span className="shrink-0 text-[11px] text-ink-faint">
                      {relative(n.updated_at)}
                    </span>
                  </div>
                </button>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
