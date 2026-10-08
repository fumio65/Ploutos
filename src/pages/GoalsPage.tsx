import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Session } from '@supabase/supabase-js'
import {
  IonAlert,
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
  IonProgressBar,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { addCircleOutline, addOutline, archiveOutline, closeOutline, removeCircleOutline, returnUpBackOutline } from 'ionicons/icons'
import { db, type Goal, type Transfer } from '../lib/db'
import { nowIso, queueChange } from '../lib/sync'
import { useSync } from '../lib/syncContext'

const SWATCHES = ['#1e2a5a', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#64748b']

type GoalFormState = {
  name: string
  targetAmount: string
  currency: string
  deadline: string // YYYY-MM-DD or ''
  color: string
}

function blankGoalForm(defaultCurrency: string): GoalFormState {
  return { name: '', targetAmount: '', currency: defaultCurrency, deadline: '', color: SWATCHES[0] }
}

type TransferDirection = 'fund' | 'withdraw'

type TransferFormState = {
  direction: TransferDirection
  goal: Goal | null
  accountId: string
  amount: string
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toLocaleString()} ${currency}`
  }
}

export function GoalsPage({ session }: { session: Session }) {
  const { syncNow } = useSync()

  const [segment, setSegment] = useState<'active' | 'archived'>('active')

  const [goalModalOpen, setGoalModalOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)
  const [goalForm, setGoalForm] = useState<GoalFormState>(blankGoalForm('PHP'))

  const [transferModalOpen, setTransferModalOpen] = useState(false)
  const [transferForm, setTransferForm] = useState<TransferFormState>({
    direction: 'fund',
    goal: null,
    accountId: '',
    amount: '',
  })
  const [transferError, setTransferError] = useState<string | null>(null)

  // Live-updates on any write to these tables — local or pulled in by a
  // background sync (e.g. a goal's balance landing after a transfer push) —
  // so the list and balances never need a manual refresh.
  const goals = useLiveQuery(async () => {
    const all = await db.goals.toArray()
    const visible = all.filter((g) => !g.deleted_at)
    visible.sort((a, b) => a.name.localeCompare(b.name))
    return visible
  }, []) ?? []

  const accounts = useLiveQuery(async () => {
    const all = await db.accounts.toArray()
    const active = all.filter((a) => !a.deleted_at && !a.is_archived)
    active.sort((a, b) => a.name.localeCompare(b.name))
    return active
  }, []) ?? []

  const visibleGoals = goals.filter((g) => g.is_archived === (segment === 'archived'))

  // --- Create/edit goal (name, target, deadline, color — never balance) ---

  const openCreateGoalModal = () => {
    setEditingGoal(null)
    setGoalForm(blankGoalForm(accounts[0]?.currency ?? 'PHP'))
    setGoalModalOpen(true)
  }

  const openEditGoalModal = (goal: Goal) => {
    setEditingGoal(goal)
    setGoalForm({
      name: goal.name,
      targetAmount: String(goal.target_amount),
      currency: goal.currency,
      deadline: goal.deadline ? goal.deadline.slice(0, 10) : '',
      color: goal.color ?? SWATCHES[0],
    })
    setGoalModalOpen(true)
  }

  const saveGoal = async () => {
    const name = goalForm.name.trim()
    const targetAmount = Number.parseFloat(goalForm.targetAmount)
    const currency = goalForm.currency.trim().toUpperCase() || 'PHP'
    if (!name || !Number.isFinite(targetAmount) || targetAmount <= 0) return

    const now = nowIso()
    const deadline = goalForm.deadline ? new Date(`${goalForm.deadline}T12:00:00`).toISOString() : undefined

    if (editingGoal) {
      // Renaming/retargeting never touches `balance` — that only ever moves
      // via a transfer row + the apply_transfer() Postgres trigger, same
      // reasoning as why AccountsPage can't edit account balance directly.
      const updated: Goal = { ...editingGoal, name, target_amount: targetAmount, currency, deadline, color: goalForm.color, updated_at: now }
      await db.goals.put(updated)
      await queueChange('goals', updated.id)
    } else {
      const goal: Goal = {
        id: crypto.randomUUID(),
        user_id: session.user.id,
        name,
        target_amount: targetAmount,
        currency,
        balance: 0,
        deadline,
        color: goalForm.color,
        is_archived: false,
        created_at: now,
        updated_at: now,
      }
      await db.goals.put(goal)
      await queueChange('goals', goal.id)
    }

    setGoalModalOpen(false)
  }

  const setGoalArchived = async (goal: Goal, archived: boolean) => {
    const updated: Goal = { ...goal, is_archived: archived, updated_at: nowIso() }
    await db.goals.put(updated)
    await queueChange('goals', updated.id)
  }

  // --- Fund / withdraw (transfers between an account and a goal) ---

  const openTransferModal = (goal: Goal, direction: TransferDirection) => {
    setTransferForm({ direction, goal, accountId: accounts[0]?.id ?? '', amount: '' })
    setTransferError(null)
    setTransferModalOpen(true)
  }

  const saveTransfer = async () => {
    const { direction, goal, accountId, amount: amountStr } = transferForm
    const amount = Number.parseFloat(amountStr)
    if (!goal || !accountId || !Number.isFinite(amount) || amount <= 0) return

    setTransferError(null)
    const now = nowIso()
    const transfer: Transfer = {
      id: crypto.randomUUID(),
      user_id: session.user.id,
      amount,
      currency: goal.currency,
      occurred_at: now,
      created_at: now,
      updated_at: now,
      ...(direction === 'fund'
        ? { from_account_id: accountId, to_goal_id: goal.id }
        : { from_goal_id: goal.id, to_account_id: accountId }),
    }

    await db.transfers.put(transfer)
    await queueChange('transfers', transfer.id)

    setTransferModalOpen(false)
    // Both sides of the transfer only actually move via the server-side
    // apply_transfer() trigger on push — sync promptly so the person sees
    // the real balances, same reasoning as TransactionsPage's syncNow().
    void syncNow()
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/tabs/more" />
          </IonButtons>
          <IonTitle>Goals</IonTitle>
        </IonToolbar>
        <IonToolbar>
          <IonSegment value={segment} onIonChange={(e) => setSegment((e.detail.value as 'active' | 'archived') ?? 'active')}>
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
        {visibleGoals.length === 0 ? (
          <p className="opacity-70 ion-padding">
            {segment === 'active' ? 'No goals yet — tap + to add one.' : 'No archived goals.'}
          </p>
        ) : (
          <IonList>
            {visibleGoals.map((goal) => {
              const progress = goal.target_amount > 0 ? Math.min(goal.balance / goal.target_amount, 1) : 0
              return (
                <IonItemSliding key={goal.id}>
                  <IonItem button onClick={() => openEditGoalModal(goal)}>
                    <div
                      slot="start"
                      style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: goal.color ?? '#999' }}
                    />
                    <IonLabel>
                      <h2>{goal.name}</h2>
                      <p>
                        {formatMoney(goal.balance, goal.currency)} of {formatMoney(goal.target_amount, goal.currency)}
                        {goal.deadline ? ` · by ${new Date(goal.deadline).toLocaleDateString()}` : ''}
                      </p>
                      <IonProgressBar value={progress} style={{ marginTop: 6, '--progress-background': goal.color ?? '#1e2a5a' } as any} />
                    </IonLabel>
                  </IonItem>
                  <IonItemOptions side="end">
                    {segment === 'active' && (
                      <>
                        <IonItemOption color="success" onClick={() => openTransferModal(goal, 'fund')}>
                          <IonIcon slot="icon-only" icon={addCircleOutline} />
                        </IonItemOption>
                        <IonItemOption color="warning" onClick={() => openTransferModal(goal, 'withdraw')}>
                          <IonIcon slot="icon-only" icon={removeCircleOutline} />
                        </IonItemOption>
                        <IonItemOption color="medium" onClick={() => setGoalArchived(goal, true)}>
                          <IonIcon slot="icon-only" icon={archiveOutline} />
                        </IonItemOption>
                      </>
                    )}
                    {segment === 'archived' && (
                      <IonItemOption color="primary" onClick={() => setGoalArchived(goal, false)}>
                        <IonIcon slot="icon-only" icon={returnUpBackOutline} />
                      </IonItemOption>
                    )}
                  </IonItemOptions>
                </IonItemSliding>
              )
            })}
          </IonList>
        )}

        {segment === 'active' && (
          <IonFab vertical="bottom" horizontal="end" slot="fixed">
            <IonFabButton onClick={openCreateGoalModal}>
              <IonIcon icon={addOutline} />
            </IonFabButton>
          </IonFab>
        )}

        {/* --- Create/edit goal modal --- */}
        <IonModal isOpen={goalModalOpen} onDidDismiss={() => setGoalModalOpen(false)}>
          <IonHeader>
            <IonToolbar>
              <IonTitle>{editingGoal ? 'Edit goal' : 'New goal'}</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={() => setGoalModalOpen(false)}>
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
                placeholder="e.g. Trip to Japan"
                value={goalForm.name}
                onIonInput={(e) => setGoalForm((f) => ({ ...f, name: e.detail.value ?? '' }))}
              />
            </IonItem>
            <IonItem>
              <IonInput
                label="Target amount"
                labelPlacement="stacked"
                type="number"
                inputmode="decimal"
                value={goalForm.targetAmount}
                onIonInput={(e) => setGoalForm((f) => ({ ...f, targetAmount: e.detail.value ?? '' }))}
              />
            </IonItem>
            <IonItem>
              <IonInput
                label="Currency (3-letter code)"
                labelPlacement="stacked"
                maxlength={3}
                value={goalForm.currency}
                onIonInput={(e) => setGoalForm((f) => ({ ...f, currency: (e.detail.value ?? '').toUpperCase() }))}
              />
            </IonItem>
            <IonItem>
              <IonInput
                label="Deadline (optional)"
                labelPlacement="stacked"
                type="date"
                value={goalForm.deadline}
                onIonInput={(e) => setGoalForm((f) => ({ ...f, deadline: e.detail.value ?? '' }))}
              />
            </IonItem>
            {editingGoal && (
              <p className="text-sm opacity-60 ion-padding-top">
                Balance isn't edited directly here — use the swipe actions (fund / withdraw) from the goals list instead.
              </p>
            )}

            <div className="ion-padding-top">
              <p className="text-sm opacity-70 mb-2">Color</p>
              <div className="flex gap-2">
                {SWATCHES.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setGoalForm((f) => ({ ...f, color: hex }))}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      backgroundColor: hex,
                      border: goalForm.color === hex ? '3px solid #000' : '1px solid rgba(0,0,0,0.2)',
                    }}
                    aria-label={`Choose color ${hex}`}
                  />
                ))}
              </div>
            </div>

            <IonButton
              expand="block"
              className="mt-6"
              onClick={saveGoal}
              disabled={!goalForm.name.trim() || !goalForm.targetAmount || Number.parseFloat(goalForm.targetAmount) <= 0}
            >
              {editingGoal ? 'Save changes' : 'Create goal'}
            </IonButton>
          </IonContent>
        </IonModal>

        {/* --- Fund / withdraw modal --- */}
        <IonModal isOpen={transferModalOpen} onDidDismiss={() => setTransferModalOpen(false)}>
          <IonHeader>
            <IonToolbar>
              <IonTitle>
                {transferForm.direction === 'fund' ? 'Add money to' : 'Withdraw from'} {transferForm.goal?.name}
              </IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={() => setTransferModalOpen(false)}>
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
                placeholder="0.00"
                value={transferForm.amount}
                onIonInput={(e) => setTransferForm((f) => ({ ...f, amount: e.detail.value ?? '' }))}
              />
            </IonItem>
            <IonItem>
              <IonSelect
                label={transferForm.direction === 'fund' ? 'From account' : 'To account'}
                labelPlacement="stacked"
                placeholder={accounts.length === 0 ? 'No accounts yet' : 'Choose account'}
                value={transferForm.accountId}
                onIonChange={(e) => setTransferForm((f) => ({ ...f, accountId: e.detail.value ?? '' }))}
              >
                {accounts.map((a) => (
                  <IonSelectOption key={a.id} value={a.id}>
                    {a.name}
                  </IonSelectOption>
                ))}
              </IonSelect>
            </IonItem>

            {accounts.length === 0 && (
              <p className="text-sm opacity-60 ion-padding-top">You need at least one account to fund or withdraw from a goal.</p>
            )}

            <IonButton
              expand="block"
              className="mt-6"
              onClick={saveTransfer}
              disabled={!transferForm.amount || !transferForm.accountId || Number.parseFloat(transferForm.amount) <= 0}
            >
              {transferForm.direction === 'fund' ? 'Add money' : 'Withdraw'}
            </IonButton>
          </IonContent>
        </IonModal>

        <IonAlert isOpen={!!transferError} onDidDismiss={() => setTransferError(null)} message={transferError ?? undefined} buttons={['OK']} />
      </IonContent>
    </IonPage>
  )
}
