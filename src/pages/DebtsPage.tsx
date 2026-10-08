import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Session } from '@supabase/supabase-js'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
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
import { addOutline, cashOutline, closeOutline } from 'ionicons/icons'
import { db, type Debt, type Receivable, type Transaction } from '../lib/db'
import { nowIso, queueChange } from '../lib/sync'
import { useSync } from '../lib/syncContext'

type TrackerType = 'debt' | 'receivable'
type Tracker = Debt | Receivable

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toLocaleString()} ${currency}`
  }
}

type TrackerFormState = {
  counterparty: string
  originalAmount: string
  currency: string
  dueDate: string // YYYY-MM-DD or ''
  note: string
}

function blankTrackerForm(defaultCurrency: string): TrackerFormState {
  return { counterparty: '', originalAmount: '', currency: defaultCurrency, dueDate: '', note: '' }
}

type RepayFormState = {
  tracker: Tracker | null
  accountId: string
  amount: string
}

export function DebtsPage({ session }: { session: Session }) {
  const { syncNow } = useSync()

  const [trackerType, setTrackerType] = useState<TrackerType>('debt')
  const [segment, setSegment] = useState<'active' | 'settled'>('active')

  const [trackerModalOpen, setTrackerModalOpen] = useState(false)
  const [editingTracker, setEditingTracker] = useState<Tracker | null>(null)
  const [trackerForm, setTrackerForm] = useState<TrackerFormState>(blankTrackerForm('PHP'))

  const [repayModalOpen, setRepayModalOpen] = useState(false)
  const [repayForm, setRepayForm] = useState<RepayFormState>({ tracker: null, accountId: '', amount: '' })

  // Live-updating — remaining_amount/is_settled are server-derived (moved only
  // by the apply_debt_receivable_repayment() Postgres trigger on push, same
  // reasoning as account/goal balances), so these need to react to a
  // background sync pull, not just local writes.
  const debts = useLiveQuery(async () => {
    const all = await db.debts.toArray()
    const visible = all.filter((d) => !d.deleted_at)
    visible.sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
    return visible
  }, []) ?? []

  const receivables = useLiveQuery(async () => {
    const all = await db.receivables.toArray()
    const visible = all.filter((r) => !r.deleted_at)
    visible.sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
    return visible
  }, []) ?? []

  const accounts = useLiveQuery(async () => {
    const all = await db.accounts.toArray()
    const active = all.filter((a) => !a.deleted_at && !a.is_archived)
    active.sort((a, b) => a.name.localeCompare(b.name))
    return active
  }, []) ?? []

  const items = trackerType === 'debt' ? debts : receivables
  const visibleItems = items.filter((t) => t.is_settled === (segment === 'settled'))

  // --- Create/edit (counterparty, due date, note — never remaining_amount) ---

  const openCreateModal = () => {
    setEditingTracker(null)
    setTrackerForm(blankTrackerForm(accounts[0]?.currency ?? 'PHP'))
    setTrackerModalOpen(true)
  }

  const openEditModal = (tracker: Tracker) => {
    setEditingTracker(tracker)
    setTrackerForm({
      counterparty: tracker.counterparty,
      originalAmount: String(tracker.original_amount),
      currency: tracker.currency,
      dueDate: tracker.due_date ? tracker.due_date.slice(0, 10) : '',
      note: tracker.note ?? '',
    })
    setTrackerModalOpen(true)
  }

  const saveTracker = async () => {
    const counterparty = trackerForm.counterparty.trim()
    const originalAmount = Number.parseFloat(trackerForm.originalAmount)
    const currency = trackerForm.currency.trim().toUpperCase() || 'PHP'
    if (!counterparty || !Number.isFinite(originalAmount) || originalAmount <= 0) return

    const now = nowIso()
    const dueDate = trackerForm.dueDate ? new Date(`${trackerForm.dueDate}T12:00:00`).toISOString() : undefined

    if (editingTracker) {
      // Renaming/rescheduling never touches original_amount/remaining_amount —
      // remaining only ever moves via a repayment transaction + the
      // apply_debt_receivable_repayment() trigger, same reasoning as why
      // AccountsPage can't edit balance and GoalsPage can't edit goal balance.
      const updated: Tracker = { ...editingTracker, counterparty, due_date: dueDate, note: trackerForm.note.trim() || undefined, updated_at: now }
      if (trackerType === 'debt') {
        await db.debts.put(updated as Debt)
        await queueChange('debts', updated.id)
      } else {
        await db.receivables.put(updated as Receivable)
        await queueChange('receivables', updated.id)
      }
    } else {
      const tracker: Tracker = {
        id: crypto.randomUUID(),
        user_id: session.user.id,
        counterparty,
        original_amount: originalAmount,
        remaining_amount: originalAmount,
        currency,
        due_date: dueDate,
        note: trackerForm.note.trim() || undefined,
        is_settled: false,
        created_at: now,
        updated_at: now,
      }
      if (trackerType === 'debt') {
        await db.debts.put(tracker as Debt)
        await queueChange('debts', tracker.id)
      } else {
        await db.receivables.put(tracker as Receivable)
        await queueChange('receivables', tracker.id)
      }
    }

    setTrackerModalOpen(false)
  }

  // --- Record a repayment (a real transaction, linked via debt_id/receivable_id) ---

  const openRepayModal = (tracker: Tracker) => {
    setRepayForm({ tracker, accountId: accounts[0]?.id ?? '', amount: String(tracker.remaining_amount) })
    setRepayModalOpen(true)
  }

  const saveRepayment = async () => {
    const { tracker, accountId, amount: amountStr } = repayForm
    const amount = Number.parseFloat(amountStr)
    if (!tracker || !accountId || !Number.isFinite(amount) || amount <= 0) return

    const now = nowIso()
    // A debt repayment is an expense (money leaves an account to pay it down);
    // a receivable repayment is income (money arrives). remaining_amount only
    // moves via the apply_debt_receivable_repayment() trigger reading this
    // transaction's debt_id/receivable_id on push — never computed here.
    const txn: Transaction = {
      id: crypto.randomUUID(),
      user_id: session.user.id,
      account_id: accountId,
      type: trackerType === 'debt' ? 'expense' : 'income',
      amount,
      currency: tracker.currency,
      occurred_at: now,
      ...(trackerType === 'debt' ? { debt_id: tracker.id } : { receivable_id: tracker.id }),
      created_at: now,
      updated_at: now,
    }

    await db.transactions.put(txn)
    await queueChange('transactions', txn.id)

    setRepayModalOpen(false)
    // remaining_amount/is_settled only actually move via the server-side
    // trigger on push — sync promptly so the person sees the real figure,
    // same reasoning as GoalsPage's fund/withdraw.
    void syncNow()
  }

  const label = trackerType === 'debt' ? 'owe' : 'owed'
  const title = trackerType === 'debt' ? 'I owe' : 'Owed to me'

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/tabs/more" />
          </IonButtons>
          <IonTitle>Debts</IonTitle>
        </IonToolbar>
        <IonToolbar>
          <IonSegment value={trackerType} onIonChange={(e) => setTrackerType((e.detail.value as TrackerType) ?? 'debt')}>
            <IonSegmentButton value="debt">
              <IonLabel>I Owe</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="receivable">
              <IonLabel>Owed to Me</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </IonToolbar>
        <IonToolbar>
          <IonSegment value={segment} onIonChange={(e) => setSegment((e.detail.value as 'active' | 'settled') ?? 'active')}>
            <IonSegmentButton value="active">
              <IonLabel>Active</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="settled">
              <IonLabel>Settled</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        {visibleItems.length === 0 ? (
          <p className="opacity-70 ion-padding">
            {segment === 'active' ? `Nothing ${label} yet — tap + to add one.` : 'Nothing settled yet.'}
          </p>
        ) : (
          <IonList>
            {visibleItems.map((tracker) => (
              <IonItem key={tracker.id} button onClick={() => openEditModal(tracker)}>
                <IonLabel>
                  <h2>{tracker.counterparty}</h2>
                  <p>
                    {formatMoney(tracker.remaining_amount, tracker.currency)} of {formatMoney(tracker.original_amount, tracker.currency)}
                    {tracker.due_date ? ` · due ${new Date(`${tracker.due_date}`).toLocaleDateString()}` : ''}
                    {tracker.is_settled ? ' · settled' : ''}
                  </p>
                  {tracker.note && <p className="opacity-60">{tracker.note}</p>}
                </IonLabel>
                {!tracker.is_settled && (
                  <IonButton
                    slot="end"
                    fill="outline"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      openRepayModal(tracker)
                    }}
                  >
                    <IonIcon slot="start" icon={cashOutline} />
                    {trackerType === 'debt' ? 'Pay' : 'Collect'}
                  </IonButton>
                )}
              </IonItem>
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

        {/* --- Create/edit tracker modal --- */}
        <IonModal isOpen={trackerModalOpen} onDidDismiss={() => setTrackerModalOpen(false)}>
          <IonHeader>
            <IonToolbar>
              <IonTitle>{editingTracker ? 'Edit' : `New ${title.toLowerCase()}`}</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={() => setTrackerModalOpen(false)}>
                  <IonIcon slot="icon-only" icon={closeOutline} />
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="ion-padding">
            <IonItem>
              <IonInput
                label={trackerType === 'debt' ? 'Who you owe' : 'Who owes you'}
                labelPlacement="stacked"
                placeholder="e.g. Jollibee Credit Card"
                value={trackerForm.counterparty}
                onIonInput={(e) => setTrackerForm((f) => ({ ...f, counterparty: e.detail.value ?? '' }))}
              />
            </IonItem>

            {editingTracker ? (
              <IonItem>
                <IonLabel>
                  <p className="opacity-60">
                    Original amount: {formatMoney(editingTracker.original_amount, editingTracker.currency)} (not editable)
                  </p>
                </IonLabel>
              </IonItem>
            ) : (
              <>
                <IonItem>
                  <IonInput
                    label="Amount"
                    labelPlacement="stacked"
                    type="number"
                    inputmode="decimal"
                    value={trackerForm.originalAmount}
                    onIonInput={(e) => setTrackerForm((f) => ({ ...f, originalAmount: e.detail.value ?? '' }))}
                  />
                </IonItem>
                <IonItem>
                  <IonInput
                    label="Currency (3-letter code)"
                    labelPlacement="stacked"
                    maxlength={3}
                    value={trackerForm.currency}
                    onIonInput={(e) => setTrackerForm((f) => ({ ...f, currency: (e.detail.value ?? '').toUpperCase() }))}
                  />
                </IonItem>
              </>
            )}

            <IonItem>
              <IonInput
                label="Due date (optional)"
                labelPlacement="stacked"
                type="date"
                value={trackerForm.dueDate}
                onIonInput={(e) => setTrackerForm((f) => ({ ...f, dueDate: e.detail.value ?? '' }))}
              />
            </IonItem>

            <IonItem>
              <IonInput
                label="Note (optional)"
                labelPlacement="stacked"
                value={trackerForm.note}
                onIonInput={(e) => setTrackerForm((f) => ({ ...f, note: e.detail.value ?? '' }))}
              />
            </IonItem>

            {editingTracker && (
              <p className="text-sm opacity-60 ion-padding-top">
                Remaining balance isn't edited directly here — use the "{trackerType === 'debt' ? 'Pay' : 'Collect'}" button from the list instead.
              </p>
            )}

            <IonButton
              expand="block"
              className="mt-6"
              onClick={saveTracker}
              disabled={!trackerForm.counterparty.trim() || (!editingTracker && (!trackerForm.originalAmount || Number.parseFloat(trackerForm.originalAmount) <= 0))}
            >
              {editingTracker ? 'Save changes' : 'Create'}
            </IonButton>
          </IonContent>
        </IonModal>

        {/* --- Record repayment modal --- */}
        <IonModal isOpen={repayModalOpen} onDidDismiss={() => setRepayModalOpen(false)}>
          <IonHeader>
            <IonToolbar>
              <IonTitle>
                {trackerType === 'debt' ? 'Pay' : 'Collect from'} {repayForm.tracker?.counterparty}
              </IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={() => setRepayModalOpen(false)}>
                  <IonIcon slot="icon-only" icon={closeOutline} />
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="ion-padding">
            <IonItem>
              <IonInput
                label="Amount"
                labelPlacement="stacked"
                type="number"
                inputmode="decimal"
                value={repayForm.amount}
                onIonInput={(e) => setRepayForm((f) => ({ ...f, amount: e.detail.value ?? '' }))}
              />
            </IonItem>
            <IonItem>
              <IonSelect
                label={trackerType === 'debt' ? 'From account' : 'To account'}
                labelPlacement="stacked"
                placeholder={accounts.length === 0 ? 'No accounts yet' : 'Choose account'}
                value={repayForm.accountId}
                onIonChange={(e) => setRepayForm((f) => ({ ...f, accountId: e.detail.value ?? '' }))}
              >
                {accounts.map((a) => (
                  <IonSelectOption key={a.id} value={a.id}>
                    {a.name}
                  </IonSelectOption>
                ))}
              </IonSelect>
            </IonItem>

            {accounts.length === 0 && (
              <p className="text-sm opacity-60 ion-padding-top">You need at least one account to record a repayment.</p>
            )}

            <IonButton
              expand="block"
              className="mt-6"
              onClick={saveRepayment}
              disabled={!repayForm.amount || !repayForm.accountId || Number.parseFloat(repayForm.amount) <= 0}
            >
              {trackerType === 'debt' ? 'Record payment' : 'Record collection'}
            </IonButton>
          </IonContent>
        </IonModal>
      </IonContent>
    </IonPage>
  )
}
