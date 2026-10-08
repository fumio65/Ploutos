import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { runSyncExclusive, startSyncListeners, type SyncResult } from './sync'

// ----------------------------------------------------------------------------
// One sync lifecycle for the whole authenticated app shell, not one per page.
// Mounted once (in AppShell) for as long as the user is signed in; starts the
// online/startup listeners here and exposes the latest result + a manual
// trigger to any page via useSync(), instead of each page re-registering its
// own listeners (which would just mean more redundant round trips, since
// runSyncExclusive() already dedupes concurrent *work* — but there's no
// reason to re-arm the listeners more than once).
// ----------------------------------------------------------------------------

interface SyncContextValue {
  syncResult: SyncResult | null
  syncing: boolean
  syncNow: () => Promise<void>
}

const SyncContext = createContext<SyncContextValue | null>(null)

export function SyncProvider({ children }: { children: ReactNode }) {
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    const stop = startSyncListeners((result) => setSyncResult(result))
    return stop
  }, [])

  const syncNow = async () => {
    setSyncing(true)
    const result = await runSyncExclusive()
    setSyncResult(result)
    setSyncing(false)
  }

  return <SyncContext.Provider value={{ syncResult, syncing, syncNow }}>{children}</SyncContext.Provider>
}

export function useSync() {
  const ctx = useContext(SyncContext)
  if (!ctx) {
    throw new Error('useSync() must be used within a <SyncProvider>')
  }
  return ctx
}
