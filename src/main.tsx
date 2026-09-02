import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import './index.css'
import './lib/theme'
import { registerMutationDefaults } from './lib/data'
import App from './App.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      // Keep a week of cache so the app opens with data while offline.
      gcTime: 7 * 24 * 60 * 60 * 1000,
    },
  },
})

// Keyed mutation functions — required so offline-queued writes can resume
// after a reload (inline functions can't be persisted).
registerMutationDefaults(queryClient)

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'sc-cache',
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        // Google Calendar state is token-derived — persisting it serves stale
        // "not connected" answers after the OAuth redirect.
        dehydrateOptions: {
          shouldDehydrateQuery: (q) => !String(q.queryKey[0]).startsWith('gcal'),
        },
      }}
      onSuccess={() => {
        // Cache restored — fire any writes that were queued while offline.
        queryClient.resumePausedMutations()
      }}
    >
      <App />
    </PersistQueryClientProvider>
  </StrictMode>,
)
