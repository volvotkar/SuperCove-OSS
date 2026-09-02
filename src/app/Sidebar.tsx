import { NavLink, useLocation } from 'react-router-dom'
import { FolderKanban, LogOut, Moon, Plus, Search, Settings, Sun, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSidebarNav } from './nav'
import { APP_NAME, APP_TAGLINE } from '../lib/config'
import { useModuleEnabled } from '../lib/useModules'
import { useAuth } from '../auth/AuthProvider'
import { setThemePref } from '../lib/theme'
import { useInsert, useRows } from '../lib/data'
import type { Project } from '../lib/types'

/**
 * Desktop: a static rail. Mobile: the same thing as a slide-in drawer.
 *
 * It used to be `hidden md:flex` with no mobile affordance at all, which made
 * Stats/Inventory/Contacts/Weekly Review/Settings — and the entire Projects
 * section including its "+" — unreachable on a phone.
 */
export function Sidebar({
  open = false,
  onClose,
  onSearch,
}: {
  open?: boolean
  onClose?: () => void
  onSearch?: () => void
}) {
  const { session, signOut } = useAuth()
  const email = session?.user.email ?? ''
  const { pathname } = useLocation()
  const nav = useSidebarNav()
  const projectsOn = useModuleEnabled('projects')

  // Close on navigation — tapping a link should not leave the drawer sitting open.
  useEffect(() => {
    onClose?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Escape closes; lock the page behind so it doesn't scroll under the drawer.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[17rem] shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-line bg-surface transition-transform duration-200 md:static md:z-auto md:w-60 md:translate-x-0 md:transition-none ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer-only close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-field text-ink-muted hover:bg-sunken hover:text-ink md:hidden"
        >
          <X size={17} />
        </button>
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
        <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-lg" />
        <div className="leading-tight">
          <div className="font-display text-[15px] font-semibold tracking-tight">{APP_NAME}</div>
          <div className="text-[11.5px] text-ink-faint">{APP_TAGLINE}</div>
        </div>
      </div>

      {/* Search */}
      <div className="px-2.5 pb-2">
        <button
          type="button"
          onClick={onSearch}
          className="flex w-full items-center gap-2.5 rounded-field border border-line bg-sunken px-2.5 py-2 text-[13.5px] text-ink-faint transition-colors hover:border-line-strong hover:text-ink-muted"
        >
          <Search size={15} />
          Search…
          <kbd className="ml-auto rounded border border-line bg-surface px-1.5 text-[10.5px] text-ink-faint">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex flex-col gap-0.5 px-2.5">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `group flex items-center gap-2.5 rounded-field px-2.5 py-2 text-[14px] font-medium transition-colors ${
                isActive
                  ? 'bg-tide-soft text-tide'
                  : 'text-ink-muted hover:bg-sunken hover:text-ink'
              }`
            }
          >
            <Icon size={17} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>

      {projectsOn && <ProjectsSection />}

      <div className="flex-1" />

      {/* Footer: theme, settings, account */}
      <div className="border-t border-line px-2.5 py-3">
        <div className="flex items-center gap-0.5">
          <ThemeToggle />
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `grid h-8 w-8 place-items-center rounded-field transition-colors ${
                isActive ? 'bg-tide-soft text-tide' : 'text-ink-muted hover:bg-sunken hover:text-ink'
              }`
            }
            aria-label="Settings"
          >
            <Settings size={16} />
          </NavLink>
          <button
            type="button"
            onClick={signOut}
            className="grid h-8 w-8 place-items-center rounded-field text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
            aria-label="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
        <div className="mt-1.5 truncate px-1 text-[12px] text-ink-faint" title={email}>
          {email}
        </div>
      </div>
      </aside>
    </>
  )
}

function ProjectsSection() {
  const { data: projects = [] } = useRows<Project>('projects', { column: 'name' })
  const insert = useInsert<Project>('projects')
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const active = projects.filter((p) => !p.archived_at)
  const archivedCount = projects.length - active.length

  function addProject(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    insert.mutate(
      { name: name.trim() },
      {
        onSuccess: () => {
          setName('')
          setNaming(false)
        },
      },
    )
  }

  return (
    <div className="mt-6 px-2.5">
      <div className="flex items-center justify-between px-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
        Projects
        <button
          type="button"
          onClick={() => setNaming((v) => !v)}
          className="grid h-5 w-5 place-items-center rounded text-ink-faint hover:bg-sunken hover:text-ink"
          aria-label="New project"
        >
          <Plus size={13} />
        </button>
      </div>
      {naming && (
        <form onSubmit={addProject} className="mt-2 px-1">
          <div className="flex gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name…"
              autoFocus
              className="min-w-0 flex-1 rounded-field border border-line bg-surface px-2.5 py-1.5 text-[13px] placeholder:text-ink-faint focus:border-tide"
            />
            {/* Enter used to be the only way to submit — invisible on a phone. */}
            <button
              type="submit"
              disabled={insert.isPending}
              className="shrink-0 rounded-field bg-tide px-2.5 py-1.5 text-[12.5px] font-medium text-tide-ink disabled:opacity-50"
            >
              Add
            </button>
          </div>
          {insert.isError && (
            <p className="mt-1 px-0.5 text-[12px] text-neg">{insert.error.message}</p>
          )}
        </form>
      )}
      <div className="mt-1.5 flex flex-col gap-0.5">
        {active.map((p) => (
          <NavLink
            key={p.id}
            to={`/projects/${p.id}`}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-field px-2.5 py-1.5 text-[13.5px] font-medium transition-colors ${
                isActive ? 'bg-tide-soft text-tide' : 'text-ink-muted hover:bg-sunken hover:text-ink'
              }`
            }
          >
            <FolderKanban size={15} />
            <span className="truncate">{p.name}</span>
          </NavLink>
        ))}
        {active.length === 0 && !naming && (
          <p className="px-1.5 py-1 text-[12.5px] text-ink-faint">None yet — hit +</p>
        )}
        {archivedCount > 0 && (
          <details className="px-1">
            <summary className="cursor-pointer list-none px-0.5 pt-1 text-[11.5px] text-ink-faint hover:text-ink-muted">
              {archivedCount} archived
            </summary>
            {projects
              .filter((p) => p.archived_at)
              .map((p) => (
                <NavLink
                  key={p.id}
                  to={`/projects/${p.id}`}
                  className="flex items-center gap-2 rounded-field px-2 py-1 text-[12.5px] text-ink-faint hover:bg-sunken"
                >
                  <FolderKanban size={13} />
                  <span className="truncate line-through decoration-1">{p.name}</span>
                </NavLink>
              ))}
          </details>
        )}
      </div>
    </div>
  )
}

export function ThemeToggle() {
  // Track dark-ness in state — reading the DOM attribute during render goes
  // stale (the attribute changes after render), which made every second
  // click a no-op.
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark',
  )

  function toggle() {
    const next = !isDark
    setIsDark(next)
    setThemePref(next ? 'dark' : 'light')
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="grid h-8 w-8 place-items-center rounded-field text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
