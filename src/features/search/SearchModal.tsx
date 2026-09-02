import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, FolderKanban, HandCoins, Inbox, ListTodo, Receipt, Search, Users, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { money } from '../../lib/format'
import { useEnabledModules } from '../../lib/useModules'

type Result = {
  type: string
  icon: typeof Search
  title: string
  sub?: string
  to: string
}

/**
 * One search bar across notes, tasks, contacts, finance entries, projects, inbox.
 *
 * Only enabled modules are queried — searching a module you switched off would
 * both leak it back into the UI and cost a request per keystroke for nothing.
 */
export function SearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const on = useEnabledModules()

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setBusy(true)
      const like = `%${q}%`
      // `skip` keeps the destructuring shape stable while sending no request.
      const skip = Promise.resolve({ data: null })
      const [todos, notes, contacts, payments, expenses, projects, inbox] = await Promise.all([
        on.has('todos')
          ? supabase.from('todos').select('id, title, list_id').ilike('title', like).limit(8)
          : skip,
        on.has('notes')
          ? supabase.from('notes').select('id, name, project_id, content').or(`name.ilike.${like},content.ilike.${like}`).limit(8)
          : skip,
        on.has('contacts')
          ? supabase.from('contacts').select('id, name, phone').or(`name.ilike.${like},phone.ilike.${like},notes.ilike.${like}`).limit(8)
          : skip,
        on.has('finance')
          ? supabase.from('payments').select('id, counterparty, amount').or(`counterparty.ilike.${like},note.ilike.${like}`).limit(8)
          : skip,
        on.has('finance')
          ? supabase.from('expenses').select('id, note, amount').ilike('note', like).limit(8)
          : skip,
        on.has('projects')
          ? supabase.from('projects').select('id, name').ilike('name', like).limit(8)
          : skip,
        on.has('capture')
          ? supabase.from('inbox_items').select('id, content').ilike('content', like).limit(8)
          : skip,
      ])

      const out: Result[] = [
        ...(projects.data ?? []).map((r) => ({
          type: 'Project', icon: FolderKanban, title: r.name, to: `/projects/${r.id}`,
        })),
        ...(todos.data ?? []).map((r) => ({
          type: 'Task', icon: ListTodo, title: r.title, to: '/todos',
        })),
        ...(notes.data ?? []).map((r) => ({
          type: 'Note', icon: FileText, title: r.name,
          // Straight to the note itself — the old link landed on the project's
          // Lists tab, and breaks outright for project-less notes.
          sub: r.content?.slice(0, 60), to: `/notes/${r.id}`,
        })),
        ...(contacts.data ?? []).map((r) => ({
          type: 'Contact', icon: Users, title: r.name, sub: r.phone ?? undefined, to: '/contacts',
        })),
        ...(payments.data ?? []).map((r) => ({
          type: 'Payment', icon: HandCoins, title: r.counterparty, sub: money(Number(r.amount)), to: '/finance',
        })),
        ...(expenses.data ?? []).map((r) => ({
          type: 'Expense', icon: Receipt, title: r.note ?? 'Expense', sub: money(Number(r.amount)), to: '/finance',
        })),
        ...(inbox.data ?? []).map((r) => ({
          type: 'Inbox', icon: Inbox, title: r.content, to: '/',
        })),
      ]
      setResults(out)
      setBusy(false)
    }, 250)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [query, on])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function go(r: Result) {
    onClose()
    navigate(r.to)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Search"
        className="w-full max-w-lg overflow-hidden rounded-card border border-line bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <Search size={16} className="shrink-0 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks, notes, contacts, money, projects…"
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-faint"
          />
          <button
            type="button"
            onClick={onClose}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-sunken"
            aria-label="Close search"
          >
            <X size={14} />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {query.trim().length < 2 ? (
            <p className="px-4 py-6 text-center text-[13px] text-ink-faint">
              Type at least two characters.
            </p>
          ) : busy && results.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-ink-faint">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-ink-faint">
              Nothing matches “{query.trim()}”.
            </p>
          ) : (
            <ul className="py-1">
              {results.map((r, i) => (
                <li key={`${r.type}-${i}`}>
                  <button
                    type="button"
                    onClick={() => go(r)}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-sunken"
                  >
                    <r.icon size={15} className="shrink-0 text-ink-faint" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px]">{r.title}</span>
                      {r.sub && <span className="block truncate text-[12px] text-ink-faint">{r.sub}</span>}
                    </span>
                    <span className="shrink-0 rounded-full bg-sunken px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">
                      {r.type}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
