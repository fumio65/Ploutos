import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Session } from '@supabase/supabase-js'
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonModal,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { addOutline, archiveOutline, closeOutline, returnUpBackOutline } from 'ionicons/icons'
import { db, type Account } from '../lib/db'
import { nowIso, queueChange } from '../lib/sync'

const ACCOUNT_TYPES: Array<{ value: Account['type']; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'e_wallet', label: 'E-Wallet' },
  { value: 'other', label: 'Other' },
]

const SWATCHES = ['#1e2a5a', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#64748b']

type FormState = {
  name: string
  type: Account['type']
  currency: string
  openingBalance: string // only used when creating
  color: string
}

const BLANK_FORM: FormState = {
  name: '',
  type: 'cash',
  currency: 'PHP',
  openingBalance: '0',
  color: SWATCHES[0],
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    // Unknown/invalid currency code — fall back to plain number + code.
    return `${amount.toLocaleString()} ${currency}`
  }
}

export function AccountsPage({ session }: { session: Session }) {
  const [segment, setSegment] = useState<'active' | 'archived'>('active')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [form, setForm] = useState<FormState>(BLANK_FORM)

  // useLiveQuery re-runs and re-renders automatically on *any* write to the
  // `accounts` table — not just ones made from this page. That's what makes
  // balance updates show up the moment a background sync pulls a server-
  // trigger-updated balance down into Dexie, with no manual "refresh" call
  // needed anywhere (here or after a sync completes elsewhere in the app).
  const accounts = useLiveQuery(async () => {
    // `name` isn't an indexed field in the Dexie schema (db.ts only indexes
    // id/user_id/type/updated_at/deleted_at), so .orderBy('name') throws a
    // SchemaError at runtime — sort in JS instead of bumping the IndexedDB
    // schema version just for display ordering.
    const all = await db.accounts.toArray()
    all.sort((a, b) => a.name.localeCompare(b.name))
    return all
  }, [])

  const visibleAccounts = (accounts ?? []).filter((a) => a.is_archived === (segment === 'archived'))

  const openCreateModal = () => {
    setEditingAccount(null)
    setForm(BLANK_FORM)
    setModalOpen(true)
  }

  const openEditModal = (account: Account) => {
    setEditingAccount(account)
    setForm({
      name: account.name,
      type: account.type,
      currency: account.currency,
      openingBalance: String(account.balance),
      color: account.color ?? SWATCHES[0],
    })
    setModalOpen(true)
  }

  const saveAccount = async () => {
    const name = form.name.trim()
    const currency = form.currency.trim().toUpperCase() || 'PHP'
    if (!name) return

    const now = nowIso()

    if (editingAccount) {
      // Editing never touches balance — that's derived from transactions/
      // transfers once T012 lands. Only identity/display fields change here.
      const updated: Account = {
        ...editingAccount,
        name,
        type: form.type,
        currency,
        color: form.color,
        updated_at: now,
      }
      await db.accounts.put(updated)
      await queueChange('accounts', updated.id)
    } else {
      const openingBalance = Number.parseFloat(form.openingBalance)
      const account: Account = {
        id: crypto.randomUUID(),
        user_id: session.user.id,
        name,
        type: form.type,
        currency,
        balance: Number.isFinite(openingBalance) ? openingBalance : 0,
        color: form.color,
        is_archived: false,
        created_at: now,
        updated_at: now,
      }
      await db.accounts.put(account)
      await queueChange('accounts', account.id)
    }

    setModalOpen(false)
  }

  const setArchived = async (account: Account, archived: boolean) => {
    const updated: Account = { ...account, is_archived: archived, updated_at: nowIso() }
    await db.accounts.put(updated)
    await queueChange('accounts', updated.id)
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Accounts</IonTitle>
        </IonToolbar>
        <IonToolbar>
          <IonSegment
            value={segment}
            onIonChange={(e) => setSegment((e.detail.value as 'active' | 'archived') ?? 'active')}
          >
            <IonSegmentButton value="active">
              <IonLabel>Active</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="archived">
              <IonLabel>Archived</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        {visibleAccounts.length === 0 ? (
          <p className="opacity-70 ion-padding">
            {segment === 'active' ? 'No accounts yet — tap + to add one.' : 'No archived accounts.'}
          </p>
        ) : (
          <IonList>
            {visibleAccounts.map((account) => (
              <IonItemSliding key={account.id}>
                <IonItem button onClick={() => openEditModal(account)}>
                  <div
                    slot="start"
                    style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: account.color ?? '#999' }}
                  />
                  <IonLabel>
                    <h2>{account.name}</h2>
                    <p>{ACCOUNT_TYPES.find((t) => t.value === account.type)?.label ?? account.type}</p>
                  </IonLabel>
                  <IonLabel slot="end" className="ion-text-end">
                    {formatMoney(account.balance, account.currency)}
                  </IonLabel>
                </IonItem>
                <IonItemOptions side="end">
                  {segment === 'active' ? (
                    <IonItemOption color="medium" onClick={() => setArchived(account, true)}>
                      <IonIcon slot="icon-only" icon={archiveOutline} />
                    </IonItemOption>
                  ) : (
                    <IonItemOption color="primary" onClick={() => setArchived(account, false)}>
                      <IonIcon slot="icon-only" icon={returnUpBackOutline} />
                    </IonItemOption>
                  )}
                </IonItemOptions>
              </IonItemSliding>
            ))}
          </IonList>
        )}

        {segment === 'active' && (
          <IonFab vertical="bottom" horizontal="end" slot="fixed">
            <IonFabButton onClick={openCreateModal}>
              <IonIcon icon={addOutline} />
            </IonFabButton>
          </IonFab>
        )}

        <IonModal isOpen={modalOpen} onDidDismiss={() => setModalOpen(false)}>
          <IonHeader>
            <IonToolbar>
              <IonTitle>{editingAccount ? 'Edit account' : 'New account'}</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={() => setModalOpen(false)}>
                  <IonIcon slot="icon-only" icon={closeOutline} />
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="ion-padding">
            <IonItem>
              <IonInput
                label="Name"
                labelPlacement="stacked"
                placeholder="e.g. BPI Savings"
                value={form.name}
                onIonInput={(e) => setForm((f) => ({ ...f, name: e.detail.value ?? '' }))}
              />
            </IonItem>
            <IonItem>
              <IonSelect
                label="Type"
                labelPlacement="stacked"
                value={form.type}
                onIonChange={(e) => setForm((f) => ({ ...f, type: e.detail.value }))}
              >
                {ACCOUNT_TYPES.map((t) => (
                  <IonSelectOption key={t.value} value={t.value}>
                    {t.label}
                  </IonSelectOption>
                ))}
              </IonSelect>
            </IonItem>
            <IonItem>
              <IonInput
                label="Currency (3-letter code)"
                labelPlacement="stacked"
                maxlength={3}
                value={form.currency}
                onIonInput={(e) => setForm((f) => ({ ...f, currency: (e.detail.value ?? '').toUpperCase() }))}
              />
            </IonItem>
            {!editingAccount && (
              <IonItem>
                <IonInput
                  label="Opening balance"
                  labelPlacement="stacked"
                  type="number"
                  inputmode="decimal"
                  value={form.openingBalance}
                  onIonInput={(e) => setForm((f) => ({ ...f, openingBalance: e.detail.value ?? '0' }))}
                />
              </IonItem>
            )}
            {editingAccount && (
              <p className="text-sm opacity-60 ion-padding-top">
                Balance isn't edited directly here — it updates from transactions and transfers.
              </p>
            )}

            <div className="ion-padding-top">
              <p className="text-sm opacity-70 mb-2">Color</p>
              <div className="flex gap-2">
                {SWATCHES.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: hex }))}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      backgroundColor: hex,
                      border: form.color === hex ? '3px solid #000' : '1px solid rgba(0,0,0,0.2)',
                    }}
                    aria-label={`Choose color ${hex}`}
                  />
                ))}
              </div>
            </div>

            <IonButton expand="block" className="mt-6" onClick={saveAccount} disabled={!form.name.trim()}>
              {editingAccount ? 'Save changes' : 'Create account'}
            </IonButton>
          </IonContent>
        </IonModal>
      </IonContent>
    </IonPage>
  )
}
