import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Archive, ArchiveRestore, HandCoins, Paperclip, Plus, Receipt, Trash2 } from 'lucide-react'
import { useDelete, useInsert, useRows, useUpdate } from '../lib/data'
import type { Expense, FinanceCategory, Payment, Project, Todo, TodoList } from '../lib/types'
import type { Attachment } from '../lib/types'
import { money } from '../lib/format'
import { unlinkTaskEvent } from '../lib/gcal'
import { Button, Card, EmptyState, Input, PageHeader } from '../components/ui'
import { InlineRename } from '../components/InlineRename'
import { Board } from '../features/projects/Board'
import { NotesTab } from '../features/projects/NotesTab'
import { AttachmentList, UploadButton } from '../features/projects/attachments'
import { ExpenseForm, PaymentForm } from '../features/finance/forms'
import { ExpenseRow, PaymentRow } from './Finance'
import { ListCard } from './Todos'
import { ScheduleModal } from '../features/todos/ScheduleModal'

const TABS = ['Lists', 'Board', 'Notes', 'Finance', 'Files'] as const
type Tab = (typeof TABS)[number]

export function ProjectPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data: projects = [] } = useRows<Project>('projects', { column: 'name' })
  // Needed to clear linked calendar events before the delete cascade runs.
  const { data: lists = [] } = useRows<TodoList>('todo_lists', { column: 'position' })
  const { data: todos = [] } = useRows<Todo>('todos', { column: 'position' })
  const update = useUpdate<Project>('projects')
  const del = useDelete('projects')
  const [tab, setTab] = useState<Tab>('Lists')

  const project = projects.find((p) => p.id === id)
  if (!project) return <EmptyState>Project not found.</EmptyState>

  const archived = !!project.archived_at

  return (
    <div>
      <PageHeader
        title={
          <InlineRename
            value={project.name}
            onRename={(name) => update.mutate({ id: project.id, patch: { name } })}
            title="Click to rename this project"
            className="font-display text-xl font-semibold tracking-tight"
          />
        }
        action={
          <div className="flex items-center gap-2">
            {archived && (
              <span className="rounded-full bg-sunken px-2.5 py-1 text-[11.5px] font-semibold text-ink-faint">
                Archived
              </span>
            )}
            <Button
              variant="ghost"
              onClick={() =>
                update.mutate({
                  id: project.id,
                  patch: { archived_at: archived ? null : new Date().toISOString() },
                })
              }
            >
              {archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
              {archived ? 'Restore' : 'Archive'}
            </Button>
            {archived && (
              <Button
                variant="danger"
                onClick={async () => {
                  if (!window.confirm(`Permanently delete “${project.name}” and everything in it?`)) return
                  // Deleting the project cascades its lists and tasks away in
                  // the DB, so linked calendar events have to be cleared first.
                  const listIds = new Set(
                    lists.filter((l) => l.project_id === project.id).map((l) => l.id),
                  )
                  await Promise.all(
                    todos
                      .filter((t) => listIds.has(t.list_id) && t.gcal_event_id)
                      .map((t) => unlinkTaskEvent(t.gcal_event_id)),
                  )
                  del.mutate(project.id, { onSuccess: () => navigate('/') })
                }}
              >
                <Trash2 size={15} /> Delete
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-5 flex w-fit max-w-full overflow-x-auto rounded-field border border-line bg-surface p-0.5">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-[7px] px-3.5 py-1.5 text-[13.5px] font-medium transition-colors ${
              tab === t ? 'bg-tide text-tide-ink' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Lists' && <ProjectLists projectId={project.id} />}
      {tab === 'Board' && <Board projectId={project.id} />}
      {tab === 'Notes' && <NotesTab projectId={project.id} />}
      {tab === 'Finance' && <ProjectFinance projectId={project.id} />}
      {tab === 'Files' && <ProjectFiles projectId={project.id} />}
    </div>
  )
}

function ProjectLists({ projectId }: { projectId: string }) {
  const { data: lists = [] } = useRows<TodoList>('todo_lists', { column: 'position' })
  const { data: todos = [] } = useRows<Todo>('todos', { column: 'position' })
  const insertList = useInsert<TodoList>('todo_lists')
  const [scheduling, setScheduling] = useState<Todo | null>(null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const projectLists = lists.filter((l) => l.section === 'project' && l.project_id === projectId)

  function addList(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    insertList.mutate(
      { section: 'project', project_id: projectId, name: name.trim(), position: projectLists.length },
      {
        onSuccess: () => {
          setName('')
          setNaming(false)
        },
      },
    )
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        {naming ? (
          <form onSubmit={addList} className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="List name…"
              autoFocus
              className="max-w-[200px]"
            />
            <Button type="submit">Add</Button>
          </form>
        ) : (
          <Button variant="ghost" onClick={() => setNaming(true)}>
            <Plus size={15} /> List
          </Button>
        )}
      </div>
      {projectLists.length === 0 ? (
        <EmptyState>No task lists in this project yet.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {projectLists.map((list) => (
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

function ProjectFinance({ projectId }: { projectId: string }) {
  const { data: expenses = [] } = useRows<Expense>('expenses', { column: 'spent_on', ascending: false })
  const { data: payments = [] } = useRows<Payment>('payments', { column: 'created_at', ascending: false })
  const { data: categories = [] } = useRows<FinanceCategory>('finance_categories', { column: 'name' })
  const { data: projects = [] } = useRows<Project>('projects', { column: 'name' })
  const [adding, setAdding] = useState<'expense' | 'payment' | null>(null)

  const pExpenses = expenses.filter((e) => e.project_id === projectId)
  const pPayments = payments.filter((p) => p.project_id === projectId)

  const spent = pExpenses.reduce((s, e) => s + Number(e.amount), 0)
  const expected = pPayments.filter((p) => p.status === 'awaited').reduce((s, p) => s + Number(p.amount), 0)
  const received = pPayments.filter((p) => p.status === 'completed').reduce((s, p) => s + Number(p.amount), 0)

  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13.5px] text-ink-muted">
          <span className="tnum font-semibold text-neg">−{money(spent)}</span> spent ·{' '}
          <span className="tnum font-semibold text-pos">+{money(received)}</span> received ·{' '}
          <span className="tnum font-semibold text-awaited">{money(expected)}</span> awaited
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setAdding('payment')}>
            <HandCoins size={15} className="text-pos" /> Payment
          </Button>
          <Button onClick={() => setAdding('expense')}>
            <Receipt size={15} /> Expense
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          {pPayments.length === 0 ? (
            <EmptyState>No payments tagged to this project.</EmptyState>
          ) : (
            <Card>
              <ul className="divide-y divide-line">
                {pPayments.map((p) => (
                  <PaymentRow key={p.id} p={p} />
                ))}
              </ul>
            </Card>
          )}
        </section>
        <section>
          {pExpenses.length === 0 ? (
            <EmptyState>No expenses tagged to this project.</EmptyState>
          ) : (
            <Card>
              <ul className="divide-y divide-line">
                {pExpenses.map((e) => (
                  <ExpenseRow key={e.id} e={e} catName={catName(e.category_id)} />
                ))}
              </ul>
            </Card>
          )}
        </section>
      </div>

      {adding === 'expense' && (
        <ExpenseForm
          categories={categories}
          projects={projects}
          defaultProjectId={projectId}
          onClose={() => setAdding(null)}
        />
      )}
      {adding === 'payment' && (
        <PaymentForm projects={projects} defaultProjectId={projectId} onClose={() => setAdding(null)} />
      )}
    </div>
  )
}

function ProjectFiles({ projectId }: { projectId: string }) {
  const { data: allAttachments = [] } = useRows<Attachment>('attachments', { column: 'created_at' })
  // Project-level files only; note attachments live with their note.
  const files = allAttachments.filter((a) => a.project_id === projectId && !a.note_id)

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <UploadButton projectId={projectId} label="Upload file">
          <Paperclip size={15} />
        </UploadButton>
      </div>
      {files.length === 0 ? (
        <EmptyState>
          No files yet — contracts, quotes, invoices. 25 MB max per file.
        </EmptyState>
      ) : (
        <Card className="px-2 py-1.5">
          <AttachmentList attachments={files} />
        </Card>
      )}
    </div>
  )
}
