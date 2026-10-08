import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  IonApp,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonButton,
  IonCard,
  IonCardContent,
} from '@ionic/react'
import { supabase } from './lib/supabase'
import { db, type Account } from './lib/db'
import { queueChange, runSyncExclusive, startSyncListeners, nowIso, type SyncResult } from './lib/sync'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const refreshAccounts = async () => {
    const all = await db.accounts.orderBy('updated_at').reverse().toArray()
    setAccounts(all)
  }

  useEffect(() => {
    refreshAccounts()
    const stop = startSyncListeners((result) => {
      setSyncResult(result)
      refreshAccounts()
    })
    return stop
  }, [])

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const createTestAccount = async () => {
    if (!session) return
    const id = crypto.randomUUID()
    const now = nowIso()
    const account: Account = {
      id,
      user_id: session.user.id,
      name: `Test Account ${now.slice(11, 19)}`,
      type: 'cash',
      currency: 'PHP',
      balance: Math.round(Math.random() * 10000),
      is_archived: false,
      created_at: now,
      updated_at: now,
    }
    await db.accounts.put(account)
    await queueChange('accounts', id)
    await refreshAccounts()
  }

  const editFirstAccountLocally = async () => {
    const first = accounts[0]
    if (!first) return
    const updated: Account = {
      ...first,
      balance: first.balance + 100,
      updated_at: nowIso(),
    }
    await db.accounts.put(updated)
    await queueChange('accounts', updated.id)
    await refreshAccounts()
  }

  const syncNow = async () => {
    setSyncing(true)
    const result = await runSyncExclusive()
    setSyncResult(result)
    await refreshAccounts()
    setSyncing(false)
  }

  return (
    <IonApp>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Ploutos</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="ion-padding">
        {/* Tailwind-styled balance card (navy/emerald, Modern Minimal theme) */}
        <div className="bg-navy text-white rounded-2xl p-6 shadow-lg">
          <p className="text-sm opacity-80">Total Balance</p>
          <p className="text-3xl font-bold mt-1">₱40,000.00</p>
          <p className="text-emerald text-sm mt-2">+ ₱10,000 saved toward Trip goal</p>
        </div>

        {/* Native Ionic card, unstyled by Tailwind, to confirm no conflict */}
        <IonCard className="mt-4">
          <IonCardContent>
            This card uses Ionic's own styling. If this renders with its normal
            card chrome (and the block above renders as a navy rounded card),
            Tailwind utilities and Ionic components are coexisting cleanly.
          </IonCardContent>
        </IonCard>

        {/* Supabase auth test (T005) */}
        <IonCard className="mt-4">
          <IonCardContent>
            {loading ? (
              <p>Checking session…</p>
            ) : session ? (
              <>
                <p className="mb-2">
                  Signed in as <strong>{session.user.email}</strong>
                </p>
                <IonButton expand="block" color="medium" onClick={signOut}>
                  Sign out
                </IonButton>
              </>
            ) : (
              <>
                <p className="mb-2">Not signed in.</p>
                <IonButton expand="block" onClick={signInWithGoogle}>
                  Sign in with Google
                </IonButton>
              </>
            )}
          </IonCardContent>
        </IonCard>

        {/* Offline sync test (T007) */}
        <IonCard className="mt-4">
          <IonCardContent>
            <p className="font-bold mb-2">Sync layer test</p>

            {!session ? (
              <p className="text-sm opacity-70">Sign in above first — accounts need a user_id.</p>
            ) : (
              <>
                <IonButton expand="block" onClick={createTestAccount}>
                  Create test account (local only)
                </IonButton>
                <IonButton
                  expand="block"
                  color="tertiary"
                  className="mt-2"
                  onClick={editFirstAccountLocally}
                  disabled={accounts.length === 0}
                >
                  Edit first account locally (+₱100)
                </IonButton>
                <IonButton
                  expand="block"
                  color="secondary"
                  className="mt-2"
                  onClick={syncNow}
                  disabled={syncing}
                >
                  {syncing ? 'Syncing…' : 'Sync now'}
                </IonButton>

                {syncResult && (
                  <p className="text-sm mt-2 opacity-80">
                    Last sync: {syncResult.online ? 'online' : 'offline, skipped'} — pushed{' '}
                    {syncResult.pushed}, remote-won {syncResult.skippedPushes}, pulled{' '}
                    {syncResult.pulled} ({new Date(syncResult.ranAt).toLocaleTimeString()})
                  </p>
                )}

                <p className="font-bold mt-4 mb-1">Local accounts ({accounts.length})</p>
                <ul className="text-sm">
                  {accounts.map((a) => (
                    <li key={a.id} className="mb-1">
                      {a.name} — ₱{a.balance.toLocaleString()} — updated{' '}
                      {new Date(a.updated_at).toLocaleTimeString()}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </IonCardContent>
        </IonCard>

        <IonButton expand="block" className="mt-4">
          Add Transaction
        </IonButton>
      </IonContent>
    </IonApp>
  )
}

export default App
