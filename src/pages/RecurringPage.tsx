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
import { addOutline, closeOutline, pauseOutline, playOutline, trashOutline } from 'ionicons/icons'
import { db, type RecurringRule } from '../lib/db'
import { frequencyLabel } from '../lib/recurring'
import { nowIso, queueChange } from '../lib/sync'

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toLocaleString()} ${currency}`
  }
}

type RuleFormState = {
  type: 'income' | 'expense'
  accountId: string
  categoryId: string
  amount: string
  currency: string
  frequency: RecurringRule['frequency']
  intervalCount: string
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD or ''
  note: string
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10)
}

export function RecurringPage({ session }: { session: Session }) {
  const [segment, setSegment] = useState<'active' | 'paused'>('active')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null)
  const [form, setForm] = useState<RuleFormState | null>(null)

  // Live-updating — any write (local, or a recurring post from the engine
  // on app start) re-renders the list automatically.
  const rules = useLiveQuery(async () => {
    const all = await db.recurring_rules.toArray()
    const visible = all.filter((r) => !r.deleted_at)
    visible.sort((a, b) => a.next_run_date.localeCompare(b.next_run_date))
    return visible
  }, []) ?? []

  const accounts = useLiveQuery(async () => {
    const all = await db.accounts.toArray()
    const active = all.filter((a) => !a.deleted_at && !a.is_archived)
    active.sort((a, b) => a.name.localeCompare(b.name))
    return active
  }, []) ?? []

  const categories = useLiveQuery(async () => {
    const all = await db.categories.toArray()
    return all.filter((c) => !c.deleted_at)
  }, []) ?? []

  const accountById = new Map(accounts.map((a) => [a.id, a]))
  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const categoryOptionsForForm = categories.filter((c) => c.kind === form?.type)

  const visibleRules = rules.filter((r) => r.is_active === (segment === 'active'))

  const blankForm = (): RuleFormState => ({
    type: 'expense',
    accountId: accounts[0]?.id ?? '',
    categoryId: categories.find((c) => c.kind === 'expense')?.id ?? '',
    amount: '',
    currency: accounts[0]?.currency ?? 'PHP',
    frequency: 'monthly',
    intervalCount: '1',
    startDate: todayDateString(),
    endDate: '',
    note: '',
  })

  const openCreateModal = () => {
    setEditingRule(null)
    setForm(blankForm())
    setModalOpen(true)
  }

  const openEditModal = (rule: RecurringRule) => {
    setEditingRule(rule)
    setForm({
      type: rule.type,
      accountId: rule.account_id,
      categoryId: rule.category_id ?? '',
      amount: String(rule.amount),
      currency: rule.currency,
      frequency: rule.frequency,
      intervalCount: String(rule.interval_count),
      startDate: rule.start_date.slice(0, 10),
      endDate: rule.end_date ? rule.end_date.slice(0, 10) : '',
      note: rule.note ?? '',
    })
    setModalOpen(true)
  }

  // Switching the income/expense segment in the form drops a now-mismatched
  // category selection back to the first matching one — same UX as the
  // add-transaction form in T012.
  const setFormType = (type: 'income' | 'expense') => {
    setForm((f) => {
      if (!f) return f
      const stillValid = categories.find((c) => c.id === f.categoryId && c.kind === type)
      return { ...f, type, categoryId: stillValid ? f.categoryId : categories.find((c) => c.kind === type)?.id ?? '' }
    })
  }

  const saveRule = async () => {
    if (!form) return
    const amount = Number.parseFloat(form.amount)
    const intervalCount = Number.parseInt(form.intervalCount, 10)
    const currency = form.currency.trim().toUpperCase() || 'PHP'
    if (!form.accountId || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(intervalCount) || intervalCount <= 0) return
    if (!form.startDate) return

    const now = nowIso()

    if (editingRule) {
      // Editing never touches next_run_date — changing amount/frequency/etc.
      // on an existing rule only affects future occurrences, not where it's
      // currently scheduled to fire next.
      const updated: RecurringRule = {
        ...editingRule,
        account_id: form.accountId,
        category_id: form.categoryId || undefined,
        type: form.type,
        amount,
        currency,
        note: form.note.trim() || undefined,
        frequency: form.frequency,
        interval_count: intervalCount,
        start_date: form.startDate,
        end_date: form.endDate || undefined,
        updated_at: now,
      }
      await db.recurring_rules.put(updated)
      await queueChange('recurring_rules', updated.id)
    } else {
      const rule: RecurringRule = {
        id: crypto.randomUUID(),
        user_id: session.user.id,
        account_id: form.accountId,
        category_id: form.categoryId || undefined,
        type: form.type,
        amount,
        currency,
        note: form.note.trim() || undefined,
        frequency: form.frequency,
        interval_count: intervalCount,
        start_date: form.startDate,
        end_date: form.endDate || undefined,
        // A new rule starts due on its own start date — if that's today or
        // earlier, the engine will post its first occurrence next time it
        // runs (next app start), exactly like any other due rule.
        next_run_date: form.startDate,
        is_active: true,
        created_at: now,
        updated_at: now,
      }
      await db.recurring_rules.put(rule)
      await queueChange('recurring_rules', rule.id)
    }

    setModalOpen(false)
  }

  const setRuleActive = async (rule: RecurringRule, isActive: boolean) => {
    const updated: RecurringRule = { ...rule, is_active: isActive, updated_at: nowIso() }
    await db.recurring_rules.put(updated)
    await queueChange('recurring_rules', updated.id)
  }

  const deleteRule = async (rule: RecurringRule) => {
    const updated: RecurringRule = { ...rule, deleted_at: nowIso(), updated_at: nowIso() }
    await db.recurring_rules.put(updated)
    await queueChange('recurring_rules', updated.id)
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/tabs/more" />
          </IonButtons>
          <IonTitle>Recurring</IonTitle>
        </IonToolbar>
        <IonToolbar>
          <IonSegment value={segment} onIonChange={(e) => setSegment((e.detail.value as 'active' | 'paused') ?? 'active')}>
            <IonSegmentButton value="active">
              <IonLabel>Active</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="paused">
              <IonLabel>Paused</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        {visibleRules.length === 0 ? (
          <p className="opacity-70 ion-padding">
            {segment === 'active' ? 'No recurring rules yet — tap + to add one.' : 'No paused rules.'}
          </p>
        ) : (
          <IonList>
            {visibleRules.map((rule) => {
              const account = accountById.get(rule.account_id)
              const category = rule.category_id ? categoryById.get(rule.category_id) : undefined
              return (
                <IonItemSliding key={rule.id}>
                  <IonItem button onClick={() => openEditModal(rule)}>
                    <div
                      slot="start"
                      style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: category?.color ?? '#999' }}
                    />
                    <IonLabel>
                      <h2>
                        {category?.name ?? (rule.type === 'income' ? 'Income' : 'Expense')}
                        {rule.note ? ` — ${rule.note}` : ''}
                      </h2>
                      <p>
                        {rule.type === 'expense' ? '-' : '+'}
                        {formatMoney(rule.amount, rule.currency)} · {frequencyLabel(rule.frequency, rule.interval_count)}
                        {account ? ` · ${account.name}` : ''}
                      </p>
                      <p className="opacity-60">
                        {segment === 'active' ? 'Next: ' : 'Was next: '}
                        {new Date(`${rule.next_run_date}T12:00:00`).toLocaleDateString()}
                        {rule.end_date ? ` · ends ${new Date(`${rule.end_date}T12:00:00`).toLocaleDateString()}` : ''}
                      </p>
                    </IonLabel>
                  </IonItem>
                  <IonItemOptions side="end">
                    {segment === 'active' ? (
                      <IonItemOption color="medium" onClick={() => setRuleActive(rule, false)}>
                        <IonIcon slot="icon-only" icon={pauseOutline} />
                      </IonItemOption>
                    ) : (
                      <IonItemOption color="primary" onClick={() => setRuleActive(rule, true)}>
                        <IonIcon slot="icon-only" icon={playOutline} />
                      </IonItemOption>
                    )}
                    <IonItemOption color="danger" onClick={() => deleteRule(rule)}>
                      <IonIcon slot="icon-only" icon={trashOutline} />
                    </IonItemOption>
                  </IonItemOptions>
                </IonItemSliding>
              )
            })}
          </IonList>
        )}

        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton onClick={openCreateModal}>
            <IonIcon icon={addOutline} />
          </IonFabButton>
        </IonFab>

        {/* --- Create/edit recurring rule modal --- */}
        <IonModal isOpen={modalOpen} onDidDismiss={() => setModalOpen(false)}>
          <IonHeader>
            <IonToolbar>
              <IonTitle>{editingRule ? 'Edit recurring' : 'New recurring'}</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={() => setModalOpen(false)}>
                  <IonIcon slot="icon-only" icon={closeOutline} />
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          {form && (
            <IonContent className="ion-padding">
              <IonSegment value={form.type} onIonChange={(e) => setFormType((e.detail.value as 'income' | 'expense') ?? 'expense')}>
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
                  onIonInput={(e) => setForm((f) => (f ? { ...f, amount: e.detail.value ?? '' } : f))}
                />
              </IonItem>

              <IonItem>
                <IonSelect
                  label="Account"
                  labelPlacement="stacked"
                  placeholder={accounts.length === 0 ? 'No accounts yet' : 'Choose account'}
                  value={form.accountId}
                  onIonChange={(e) => setForm((f) => (f ? { ...f, accountId: e.detail.value ?? '' } : f))}
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
                  placeholder={categoryOptionsForForm.length === 0 ? 'No categories' : 'Choose category'}
                  value={form.categoryId}
                  onIonChange={(e) => setForm((f) => (f ? { ...f, categoryId: e.detail.value ?? '' } : f))}
                >
                  {categoryOptionsForForm.map((c) => (
                    <IonSelectOption key={c.id} value={c.id}>
                      {c.name}
                    </IonSelectOption>
                  ))}
                </IonSelect>
              </IonItem>

              <IonItem>
                <IonSelect
                  label="Frequency"
                  labelPlacement="stacked"
                  value={form.frequency}
                  onIonChange={(e) =>
                    setForm((f) => (f ? { ...f, frequency: (e.detail.value as RecurringRule['frequency']) ?? 'monthly' } : f))
                  }
                >
                  <IonSelectOption value="daily">Daily</IonSelectOption>
                  <IonSelectOption value="weekly">Weekly</IonSelectOption>
                  <IonSelectOption value="monthly">Monthly</IonSelectOption>
                  <IonSelectOption value="yearly">Yearly</IonSelectOption>
                </IonSelect>
              </IonItem>

              <IonItem>
                <IonInput
                  label="Repeat every"
                  labelPlacement="stacked"
                  type="number"
                  inputmode="numeric"
                  min={1}
                  value={form.intervalCount}
                  onIonInput={(e) => setForm((f) => (f ? { ...f, intervalCount: e.detail.value ?? '1' } : f))}
                />
              </IonItem>

              <IonItem>
                <IonInput
                  label="Starts on"
                  labelPlacement="stacked"
                  type="date"
                  value={form.startDate}
                  onIonInput={(e) => setForm((f) => (f ? { ...f, startDate: e.detail.value ?? '' } : f))}
                />
              </IonItem>

              <IonItem>
                <IonInput
                  label="Ends on (optional)"
                  labelPlacement="stacked"
                  type="date"
                  value={form.endDate}
                  onIonInput={(e) => setForm((f) => (f ? { ...f, endDate: e.detail.value ?? '' } : f))}
                />
              </IonItem>

              <IonItem>
                <IonInput
                  label="Note (optional)"
                  labelPlacement="stacked"
                  placeholder="e.g. Netflix subscription"
                  value={form.note}
                  onIonInput={(e) => setForm((f) => (f ? { ...f, note: e.detail.value ?? '' } : f))}
                />
              </IonItem>

              {editingRule && (
                <p className="text-sm opacity-60 ion-padding-top">
                  Changing these fields only affects future occurrences — transactions already posted by this rule aren't touched.
                </p>
              )}

              <IonButton
                expand="block"
                className="mt-6"
                onClick={saveRule}
                disabled={!form.accountId || !form.amount || Number.parseFloat(form.amount) <= 0 || !form.startDate}
              >
                {editingRule ? 'Save changes' : 'Create recurring rule'}
              </IonButton>
            </IonContent>
          )}
        </IonModal>
      </IonContent>
    </IonPage>
  )
}
