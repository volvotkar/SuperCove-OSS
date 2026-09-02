import { useCallback, useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu, Search } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { SearchModal } from '../features/search/SearchModal'
import { OfflineBanner } from '../components/OfflineBanner'
import { APP_NAME } from '../lib/config'

export function AppShell() {
  const [searching, setSearching] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // Stable identity: Sidebar closes on every route change via an effect, so an
  // inline arrow here would re-fire that effect on each render.
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  // Cmd/Ctrl+K opens global search anywhere in the app.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearching(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex min-h-full">
      <OfflineBanner />
      <Sidebar open={menuOpen} onClose={closeMenu} onSearch={() => setSearching(true)} />
      <main className="min-w-0 flex-1 pb-20 md:pb-0">
        {/* Mobile top bar — the only way into the drawer (and search). Replaces
            the old bottom-right FAB, which sat on top of page content. */}
        <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-surface/95 px-3 py-2 backdrop-blur md:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="grid h-9 w-9 place-items-center rounded-field text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
          >
            <Menu size={19} />
          </button>
          <span className="font-display text-[15px] font-semibold tracking-tight">{APP_NAME}</span>
          <button
            type="button"
            onClick={() => setSearching(true)}
            aria-label="Search"
            className="ml-auto grid h-9 w-9 place-items-center rounded-field text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
          >
            <Search size={18} />
          </button>
        </div>

        <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </div>
      </main>
      <BottomNav />

      {searching && <SearchModal onClose={() => setSearching(false)} />}
    </div>
  )
}
