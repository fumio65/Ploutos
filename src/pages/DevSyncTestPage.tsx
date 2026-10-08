import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { db, type Account } from '../lib/db'
import { nowIso, queueChange } from '../lib/sync'
import { useSync } from '../lib/syncContext'

/**
 * The original T007 sync-layer verification harness, moved here (off the
 * Dashboard tab, where it started life) once the real app shell (T008) had
 * somewhere more sensible to put it. Still useful for re-verifying the sync
 * layer by hand later, so kept rather than deleted — reachable from More.
 */
export function DevSyncTestPage({ session }: { session: Session | null }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const { syncResult, syncing, syncNow } = useSync()

  const refreshAccounts = async () => {
    const all = await db.accounts.orderBy('updated_at').reverse().toArray()
    setAccounts(all)
  }

  useEffect(() => {
    refreshAccounts()
  }, [])

  // Re-read Dexie whenever a sync (automatic or manual) completes.
  useEffect(() => {
    if (syncResult) refreshAccounts()
  }, [syncResult])

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

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/tabs/more" />
          </IonButtons>
          <IonTitle>Dev: Sync layer test</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <IonCard>
          <IonCardContent>
            {!session ? (
              <p className="text-sm opacity-70">Sign in first — accounts need a user_id.</p>
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
                <IonButton expand="block" color="secondary" className="mt-2" onClick={syncNow} disabled={syncing}>
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
      </IonContent>
    </IonPage>
  )
}
