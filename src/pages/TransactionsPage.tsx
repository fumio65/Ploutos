import { useMemo, useState } from 'react'
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
  IonLabel,
  IonList,
  IonModal,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { addOutline, closeOutline } from 'ionicons/icons'
import { db, type Account, type Category, type Transaction } from '../lib/db'
import { nowIso, queueChange } from '../lib/sync'
import { useSync } from '../lib/syncContext'

const ALL_ACCOUNTS = 'all'

type FormState = {
  type: Transaction['type']
  amount: string
  date: string // YYYY-MM-DD, from the native date input
  accountId: string
  categoryId: string
  note: string
}

function todayDateInput() {
  return new Date().toISOString().slice(0, 10)
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toLocaleString()} ${currency}`
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function TransactionsPage({ session }: { session: Session }) {
  const { syncNow } = useSync()

  const [accountFilter, setAccountFilter] = useState<string>(ALL_ACCOUNTS)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<FormState>(blankForm('expense', [], []))

  // Each of these re-renders automatically on any write to its table — local
  // or pulled down by a background sync (e.g. a transaction's account balance
  // landing after push) — so nothing here needs a manual refresh.
  const accounts = useLiveQuery(async () => {
    const all = await db.accounts.toArray()
    const active = all.filter((a) => !a.deleted_at && !a.is_archived)
    active.sort((a, b) => a.name.localeCompare(b.name))
    return active
  }, []) ?? []
  const categories = useLiveQuery(async () => {
    const all = await db.categories.toArray()
    const visible = all.filter((c) => !c.deleted_at)
    visible.sort((a, b) => a.name.localeCompare(b.name))
    return visible
  }, []) ?? []
  const transactions = useLiveQuery(async () => {
    const all = await db.transactions.toArray()
    const visible = all.filter((t) => !t.deleted_at)
    visible.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    return visible
  }, []) ?? []

  // Debt/receivable repayments are linked via debt_id/receivable_id instead
  // of a category (see DebtsPage/T016) — loaded here only to turn one of
  // those into a readable label instead of a bare "Uncategorized".
  const debts = useLiveQuery(async () => db.debts.toArray(), []) ?? []
  const receivables = useLiveQuery(async () => db.receivables.toArray(), []) ?? []

  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const debtsById = useMemo(() => new Map(debts.map((d) => [d.id, d])), [debts])
  const receivablesById = useMemo(() => new Map(receivables.map((r) => [r.id, r])), [receivables])

  const visibleTransactions =
    accountFilter === ALL_ACCOUNTS ? transactions : transactions.filter((t) => t.account_id === accountFilter)

  function blankForm(type: Transaction['type'], accts: Account[], cats: Category[]): FormState {
    return {
      type,
      amount: '',
      date: todayDateInput(),
      accountId: accts[0]?.id ?? '',
      categoryId: cats.find((c) => c.kind === type)?.id ?? '',
      note: '',
    }
  }

  const openCreateModal = () => {
    setForm(blankForm('expense', accounts, categories))
    setModalOpen(true)
  }

  const setFormType = (type: Transaction['type']) => {
    setForm((f) => ({
      ...f,
      type,
      // Switching income/expense usually means a different category list —
      // drop a now-mismatched selection back to the first category of the
      // new kind, rather than silently keeping e.g. an income category on
      // an expense row.
      categoryId: categories.find((c) => c.id === f.categoryId && c.kind === type)
        ? f.categoryId
        : categories.find((c) => c.kind === type)?.id ?? '',
    }))
  }

  const categoryOptionsForForm = categories.filter((c) => c.kind === form.type)

  // A transaction's label: its category when it has one, or — for a debt/
  // receivable repayment, which is deliberately uncategorized (principal
  // repayment isn't discretionary spending) — the counterparty it's linked
  // to, so the list reads as "Debt repayment: Credit Card" rather than a
  // bare, unexplained "Uncategorized".
  function transactionLabel(t: Transaction): string {
    if (t.category_id) {
      const category = categoriesById.get(t.category_id)
      if (category) return category.name
    }
    if (t.debt_id) {
      const debt = debtsById.get(t.debt_id)
      return debt ? `Debt repayment: ${debt.counterparty}` : 'Debt repayment'
    }
    if (t.receivable_id) {
      const receivable = receivablesById.get(t.receivable_id)
      return receivable ? `Collected: ${receivable.counterparty}` : 'Collection'
    }
    return 'Uncategorized'
  }

  const saveTransaction = async () => {
    const amount = Number.parseFloat(form.amount)
    if (!Number.isFinite(amount) || amount <= 0) return
    if (!form.accountId) return

    const account = accounts.find((a) => a.id === form.accountId)
    if (!account) return

    const now = nowIso()
    // Anchor at noon local time so the date the person picked can't shift to
    // the day before/after when converted to UTC for storage.
    const occurredAt = new Date(`${form.date}T12:00:00`).toISOString()

    const transaction: Transaction = {
      id: crypto.randomUUID(),
      user_id: session.user.id,
      account_id: form.accountId,
      category_id: form.categoryId || undefined,
      type: form.type,
      amount,
      currency: account.currency,
      note: form.note.trim() || undefined,
      occurred_at: occurredAt,
      created_at: now,
      updated_at: now,
    }

    await db.transactions.put(transaction)
    await queueChange('transactions', transaction.id)

    setModalOpen(false)
    // Account balances only move via the server-side trigger on insert, so
    // push this right away (best-effort — if offline, it just queues for
    // the next automatic sync) instead of waiting for the next online event.
    void syncNow()
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Transactions</IonTitle>
        </IonToolbar>
        <IonToolbar>
          <IonItem lines="none">
            <IonSelect
              label="Account"
              labelPlacement="start"
              value={accountFilter}
              onIonChange={(e) => setAccountFilter(e.detail.value ?? ALL_ACCOUNTS)}
            >
              <IonSelectOption value={ALL_ACCOUNTS}>All accounts</IonSelectOption>
              {accounts.map((a) => (
                <IonSelectOption key={a.id} value={a.id}>
                  {a.name}
                </IonSelectOption>
              ))}
            </IonSelect>
          </IonItem>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        {visibleTransactions.length === 0 ? (
          <p className="opacity-70 ion-padding">
            {accounts.length === 0
              ? 'Create an account first (Accounts tab), then add a transaction here.'
              : 'No transactions yet — tap + to add one.'}
          </p>
        ) : (
          <IonList>
            {visibleTransactions.map((t) => {
              const category = t.category_id ? categoriesById.get(t.category_id) : undefined
              const account = accountsById.get(t.account_id)
              const signedAmount = t.type === 'income' ? t.amount : -t.amount
              return (
                <IonItem key={t.id}>
                  <div
                    slot="start"
                    style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: category?.color ?? '#999' }}
                  />
                  <IonLabel>
                    <h2>{transactionLabel(t)}</h2>
                    <p>
                      {formatDate(t.occurred_at)}
                      {accountFilter === ALL_ACCOUNTS && account ? ` · ${account.name}` : ''}
                      {t.note ? ` · ${t.note}` : ''}
                    </p>
                  </IonLabel>
                  <IonLabel slot="end" className="ion-text-end" style={{ color: t.type === 'income' ? '#10b981' : '#ef4444' }}>
                    {t.type === 'income' ? '+' : '-'}
                    {formatMoney(Math.abs(signedAmount), t.currency)}
                  </IonLabel>
                </IonItem>
              )
            })}
          </IonList>
        )}

        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton onClick={openCreateModal}>
            <IonIcon icon={addOutline} />
          </IonFabButton>
        </IonFab>

        <IonModal isOpen={modalOpen} onDidDismiss={() => setModalOpen(false)}>
          <IonHeader>
            <IonToolbar>
              <IonTitle>New transaction</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={() => setModalOpen(false)}>
                  <IonIcon slot="icon-only" icon={closeOutline} />
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="ion-padding">
            <IonSegment value={form.type} onIonChange={(e) => setFormType((e.detail.value as Transaction['type']) ?? 'expense')}>
              <IonSegmentButton value="expense">
                <IonLabel>Expense</IonLabel>
              </IonSegmentButton>
              <IonSegmentButton value="income">
                <IonLabel>Income</IonLabel>
              </IonSegmentButton>
            </IonSegment>

            <IonItem className="ion-margin-top">
              <IonInput
                label="Amount"
                labelPlacement="stacked"
                type="number"
                inputmode="decimal"
                placeholder="0.00"
                value={form.amount}
                onIonInput={(e) => setForm((f) => ({ ...f, amount: e.detail.value ?? '' }))}
              />
            </IonItem>

            <IonItem>
              <IonInput
                label="Date"
                labelPlacement="stacked"
                type="date"
                value={form.date}
                onIonInput={(e) => setForm((f) => ({ ...f, date: e.detail.value ?? todayDateInput() }))}
              />
            </IonItem>

            <IonItem>
              <IonSelect
                label="Account"
                labelPlacement="stacked"
                placeholder={accounts.length === 0 ? 'No accounts yet' : 'Choose account'}
                value={form.accountId}
                onIonChange={(e) => setForm((f) => ({ ...f, accountId: e.detail.value ?? '' }))}
              >
                {accounts.map((a) => (
                  <IonSelectOption key={a.id} value={a.id}>
                    {a.name}
                  </IonSelectOption>
                ))}
              </IonSelect>
            </IonItem>

            <IonItem>
              <IonSelect
                label="Category"
                labelPlacement="stacked"
                placeholder="Choose category"
                value={form.categoryId}
                onIonChange={(e) => setForm((f) => ({ ...f, categoryId: e.detail.value ?? '' }))}
              >
                {categoryOptionsForForm.map((c) => (
                  <IonSelectOption key={c.id} value={c.id}>
                    {c.name}
                  </IonSelectOption>
                ))}
              </IonSelect>
            </IonItem>

            <IonItem>
              <IonTextarea
                label="Note"
                labelPlacement="stacked"
                placeholder="Optional"
                autoGrow
                value={form.note}
                onIonInput={(e) => setForm((f) => ({ ...f, note: e.detail.value ?? '' }))}
              />
            </IonItem>

            {accounts.length === 0 && (
              <p className="text-sm opacity-60 ion-padding-top">
                You need at least one account before you can log a transaction.
              </p>
            )}

            <IonButton
              expand="block"
              className="mt-6"
              onClick={saveTransaction}
              disabled={!form.amount || !form.accountId || Number.parseFloat(form.amount) <= 0}
            >
              Add transaction
            </IonButton>
          </IonContent>
        </IonModal>
      </IonContent>
    </IonPage>
  )
}
