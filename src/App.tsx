import { Suspense, lazy, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { SignIn } from './auth/SignIn'
import { AppShell } from './app/AppShell'
import { LoadScreen } from './app/LoadScreen'
import { Dashboard } from './pages/Dashboard'
import { useEnabledModules } from './lib/useModules'

/**
 * Every optional page is code-split. A module switched off in Settings never has
 * its route registered, so its chunk is never requested — the toggle removes the
 * code from the session, not just the link.
 *
 * Dashboard is eager: it is the landing route, and lazy-loading it would put a
 * spinner in front of every cold start.
 */
const Todos = lazyPage(() => import('./pages/Todos'), 'Todos')
const Calendar = lazyPage(() => import('./pages/Calendar'), 'Calendar')
const Finance = lazyPage(() => import('./pages/Finance'), 'Finance')
const Contacts = lazyPage(() => import('./pages/Contacts'), 'Contacts')
const Inventory = lazyPage(() => import('./pages/Inventory'), 'Inventory')
const WeeklyReviewPage = lazyPage(() => import('./pages/WeeklyReview'), 'WeeklyReviewPage')
const Habits = lazyPage(() => import('./pages/Habits'), 'Habits')
const Stats = lazyPage(() => import('./pages/Stats'), 'Stats')
const Notes = lazyPage(() => import('./pages/Notes'), 'Notes')
const Scrapbook = lazyPage(() => import('./pages/Scrapbook'), 'Scrapbook')
const ProjectPage = lazyPage(() => import('./pages/ProjectPage'), 'ProjectPage')
const Settings = lazyPage(() => import('./pages/Settings'), 'Settings')

/** These pages use named exports; React.lazy wants a default. */
function lazyPage<T extends string>(
  load: () => Promise<Record<T, React.ComponentType>>,
  name: T,
) {
  return lazy(() => load().then((m) => ({ default: m[name] })))
}

function PageFallback() {
  return <div className="px-1 py-10 text-[14px] text-ink-faint">Loading…</div>
}

function Gate() {
  const { session, loading } = useAuth()
  const [intro, setIntro] = useState(true)
  const on = useEnabledModules()

  return (
    <>
      {intro && <LoadScreen onDone={() => setIntro(false)} />}
      {!loading && !session && <SignIn />}
      {!loading && session && (
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Dashboard />} />
              {on.has('todos') && <Route path="todos" element={<Todos />} />}
              {on.has('calendar') && <Route path="calendar" element={<Calendar />} />}
              {on.has('finance') && <Route path="finance" element={<Finance />} />}
              {on.has('contacts') && <Route path="contacts" element={<Contacts />} />}
              {on.has('inventory') && <Route path="inventory" element={<Inventory />} />}
              {on.has('review') && <Route path="review" element={<WeeklyReviewPage />} />}
              {on.has('habits') && <Route path="habits" element={<Habits />} />}
              {on.has('stats') && <Route path="stats" element={<Stats />} />}
              {on.has('notes') && <Route path="notes" element={<Notes />} />}
              {on.has('notes') && <Route path="notes/:id" element={<Notes />} />}
              {on.has('scrapbook') && <Route path="scrapbook" element={<Scrapbook />} />}
              {on.has('scrapbook') && <Route path="scrapbook/:id" element={<Scrapbook />} />}
              {on.has('projects') && <Route path="projects/:id" element={<ProjectPage />} />}
              <Route path="settings" element={<Settings />} />
              {/* A bookmark to a disabled module lands home, not on a blank screen. */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
      )}
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
