import { useEffect, useState } from 'react'
import { CloudOff, RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Never fail silently: a visible strip while offline, and a brief "syncing"
 * state when the connection returns and queued writes flush.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const qc = useQueryClient()

  useEffect(() => {
    async function onOnline() {
      setOffline(false)
      setSyncing(true)
      try {
        await qc.resumePausedMutations()
        await qc.invalidateQueries()
      } finally {
        setSyncing(false)
      }
    }
    function onOffline() {
      setOffline(true)
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [qc])

  if (!offline && !syncing) return null

  return (
    <div
      role="status"
      className={`fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 px-4 py-1.5 text-[12.5px] font-medium ${
        offline ? 'bg-awaited-soft text-awaited' : 'bg-pos-soft text-pos'
      }`}
    >
      {offline ? (
        <>
          <CloudOff size={13} />
          Offline — viewing cached data. New entries are saved and will sync when you reconnect.
        </>
      ) : (
        <>
          <RefreshCw size={13} className="animate-spin" />
          Back online — syncing queued changes…
        </>
      )}
    </div>
  )
}
