import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Session } from '@supabase/supabase-js'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
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
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { closeOutline } from 'ionicons/icons'
import { db, type Budget, type Category } from '../lib/db'
import { nowIso, queueChange } from '../lib/sync'

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toLocaleString()} ${currency}`
  }
}

function startOfThisMonthIso() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}

type BudgetFormState = {
  category: Category | null
  existingBudget: Budget | null
  monthlyLimit: string
}

export function BudgetsPage({ session }: { session: Session }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<BudgetFormState>({ category: null, existingBudget: null, monthlyLimit: '' })

  // Live-updating queries — any Dexie write (local or from sync) triggers a
  // re-render, so budgets and spending stay in sync automatically.
  const categories = useLiveQuery(async () => {
    const all = await db.categories.toArray()
    // Only expense categories make sense for budgets
    const expense = all.filter((c) => !c.deleted_at && c.kind === 'expense')
    expense.sort((a, b) => a.name.localeCompare(b.name))
    return expense
  }, []) ?? []

  const budgets = useLiveQuery(async () => {
    const all = await db.budgets.toArray()
    return all.filter((b) => !b.deleted_at)
  }, []) ?? []

  const monthTransactions = useLiveQuery(async () => {
    const all = await db.transactions.toArray()
    const monthStart = startOfThisMonthIso()
    return all.filter((t) => !t.deleted_at && t.type === 'expense' && t.occurred_at >= monthStart)
  }, []) ?? []

  // Index budgets by category_id for fast lookup
  const budgetByCategoryId = new Map(budgets.map((b) => [b.category_id, b]))

  // Sum spending per category for the current month
  const spentByCategoryId = new Map<string, number>()
  for (const t of monthTransactions) {
    if (t.category_id) {
      spentByCategoryId.set(t.category_id, (spentByCategoryId.get(t.category_id) ?? 0) + t.amount)
    }
  }

  // Split categories into those with budgets (sorted by name) and those without
  const withBudget = categories.filter((c) => budgetByCategoryId.has(c.id))
  const withoutBudget = categories.filter((c) => !budgetByCategoryId.has(c.id))

  const openSetBudgetModal = (category: Category) => {
    const existing = budgetByCategoryId.get(category.id) ?? null
    setForm({
      category,
      existingBudget: existing,
      monthlyLimit: existing ? String(existing.monthly_limit) : '',
    })
    setModalOpen(true)
  }

  const saveBudget = async () => {
    const { category, existingBudget, monthlyLimit: limitStr } = form
    const limit = Number.parseFloat(limitStr)
    if (!category || !Number.isFinite(limit) || limit <= 0) return

    const now = nowIso()

    if (existingBudget) {
      const updated: Budget = { ...existingBudget, monthly_limit: limit, updated_at: now }
      await db.budgets.put(updated)
      await queueChange('budgets', updated.id)
    } else {
      const budget: Budget = {
        id: crypto.randomUUID(),
        user_id: session.user.id,
        category_id: category.id,
        monthly_limit: limit,
        currency: category.color ? 'PHP' : 'PHP', // Default currency — matches existing accounts
        created_at: now,
        updated_at: now,
      }
      // Try to inherit currency from the user's first account
      const accounts = await db.accounts.toArray()
      const firstActive = accounts.find((a) => !a.deleted_at && !a.is_archived)
      if (firstActive) budget.currency = firstActive.currency

      await db.budgets.put(budget)
      await queueChange('budgets', budget.id)
    }

    setModalOpen(false)
  }

  const removeBudget = async (budget: Budget) => {
    const updated: Budget = { ...budget, deleted_at: nowIso(), updated_at: nowIso() }
    await db.budgets.put(updated)
    await queueChange('budgets', updated.id)
  }

  const monthLabel = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/tabs/more" />
          </IonButtons>
          <IonTitle>Budgets</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        <p className="ion-padding-horizontal ion-padding-top text-sm opacity-70">{monthLabel}</p>

        {withBudget.length === 0 && withoutBudget.length === 0 ? (
          <p className="opacity-70 ion-padding">No expense categories yet — add some in Categories first.</p>
        ) : (
          <>
            {withBudget.length > 0 && (
              <IonList>
                {withBudget.map((cat) => {
                  const budget = budgetByCategoryId.get(cat.id)!
                  const spent = spentByCategoryId.get(cat.id) ?? 0
                  const progress = budget.monthly_limit > 0 ? Math.min(spent / budget.monthly_limit, 1) : 0
                  const overBudget = spent > budget.monthly_limit
                  const progressColor = overBudget ? '#ef4444' : spent / budget.monthly_limit > 0.8 ? '#f59e0b' : '#10b981'

                  return (
                    <IonItemSliding key={cat.id}>
                      <IonItem button onClick={() => openSetBudgetModal(cat)}>
                        <div
                          slot="start"
                          style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: cat.color ?? '#999' }}
                        />
                        <IonLabel>
                          <h2>{cat.name}</h2>
                          <p>
                            {formatMoney(spent, budget.currency)} of {formatMoney(budget.monthly_limit, budget.currency)}
                            {overBudget ? ' — over budget!' : ''}
                          </p>
                          <IonProgressBar
                            value={progress}
                            style={{ marginTop: 6, '--progress-background': progressColor } as any}
                          />
                        </IonLabel>
                      </IonItem>
                      <IonItemOptions side="end">
                        <IonItemOption color="danger" onClick={() => removeBudget(budget)}>
                          Remove
                        </IonItemOption>
                      </IonItemOptions>
                    </IonItemSliding>
                  )
                })}
              </IonList>
            )}

            {withoutBudget.length > 0 && (
              <>
                <p className="ion-padding-horizontal ion-padding-top text-sm opacity-60">
                  {withBudget.length > 0 ? 'Categories without a budget' : 'Tap a category to set a monthly budget'}
                </p>
                <IonList>
                  {withoutBudget.map((cat) => {
                    const spent = spentByCategoryId.get(cat.id) ?? 0
                    return (
                      <IonItem key={cat.id} button onClick={() => openSetBudgetModal(cat)}>
                        <div
                          slot="start"
                          style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: cat.color ?? '#999' }}
                        />
                        <IonLabel>
                          <h2>{cat.name}</h2>
                          <p className="opacity-60">
                            {spent > 0 ? `${formatMoney(spent, 'PHP')} spent this month · ` : ''}No budget set
                          </p>
                        </IonLabel>
                      </IonItem>
                    )
                  })}
                </IonList>
              </>
            )}
          </>
        )}

        {/* --- Set/edit budget modal --- */}
        <IonModal isOpen={modalOpen} onDidDismiss={() => setModalOpen(false)}>
          <IonHeader>
            <IonToolbar>
              <IonTitle>{form.existingBudget ? 'Edit budget' : 'Set budget'}</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={() => setModalOpen(false)}>
                  <IonIcon slot="icon-only" icon={closeOutline} />
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="ion-padding">
            <p className="text-lg font-semibold mb-4">{form.category?.name}</p>

            <IonItem>
              <IonInput
                label="Monthly limit"
                labelPlacement="stacked"
                type="number"
                inputmode="decimal"
                placeholder="0.00"
                value={form.monthlyLimit}
                onIonInput={(e) => setForm((f) => ({ ...f, monthlyLimit: e.detail.value ?? '' }))}
              />
            </IonItem>

            <IonButton
              expand="block"
              className="mt-6"
              onClick={saveBudget}
              disabled={!form.monthlyLimit || Number.parseFloat(form.monthlyLimit) <= 0}
            >
              {form.existingBudget ? 'Save changes' : 'Set budget'}
            </IonButton>
          </IonContent>
        </IonModal>
      </IonContent>
    </IonPage>
  )
}
