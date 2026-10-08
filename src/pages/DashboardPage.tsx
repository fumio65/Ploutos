import { useLiveQuery } from 'dexie-react-hooks'
import type { Session } from '@supabase/supabase-js'
import { IonCard, IonCardContent, IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/react'
import { db } from '../lib/db'

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toLocaleString()} ${currency}`
  }
}

/** Sums `amountOf(item)` per distinct currency, so multi-currency data never gets silently added together. */
function sumByCurrency<T>(items: T[], currencyOf: (item: T) => string, amountOf: (item: T) => number) {
  const totals = new Map<string, number>()
  for (const item of items) {
    const currency = currencyOf(item)
    totals.set(currency, (totals.get(currency) ?? 0) + amountOf(item))
  }
  return totals
}

function startOfThisMonthIso() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}

export function DashboardPage({ session }: { session: Session }) {
  // Each query re-runs and re-renders live on any write to its table — local
  // or pulled down by a background sync — so balances update here the moment
  // a push/pull completes, with no manual refresh needed.
  const accounts = useLiveQuery(async () => {
    const all = await db.accounts.toArray()
    return all.filter((a) => a.user_id === session.user.id && !a.deleted_at && !a.is_archived)
  }, [session.user.id]) ?? []

  const goals = useLiveQuery(async () => {
    const all = await db.goals.toArray()
    return all.filter((g) => g.user_id === session.user.id && !g.deleted_at && !g.is_archived)
  }, [session.user.id]) ?? []

  const monthTransactions = useLiveQuery(async () => {
    const all = await db.transactions.toArray()
    const monthStart = startOfThisMonthIso()
    return all.filter((t) => t.user_id === session.user.id && !t.deleted_at && t.occurred_at >= monthStart)
  }, [session.user.id]) ?? []

  // Debts/receivables (T016) affect Net Worth too, per ARCHITECTURE.md /
  // DECISIONS.md's definition (accounts + goals + receivables − debts) —
  // this was missed when Debts/Receivables shipped after this Dashboard did.
  const debts = useLiveQuery(async () => {
    const all = await db.debts.toArray()
    return all.filter((d) => d.user_id === session.user.id && !d.deleted_at)
  }, [session.user.id]) ?? []

  const receivables = useLiveQuery(async () => {
    const all = await db.receivables.toArray()
    return all.filter((r) => r.user_id === session.user.id && !r.deleted_at)
  }, [session.user.id]) ?? []

  // Every total here is a straight sum of already-synced local records (account
  // balances kept correct by the server-side apply_transaction()/apply_transfer()
  // triggers; transaction amounts as posted) — nothing is recomputed from
  // scratch client-side, so these numbers can't drift from what synced down.
  const balanceByCurrency = sumByCurrency(accounts, (a) => a.currency, (a) => a.balance)
  const goalsByCurrency = sumByCurrency(goals, (g) => g.currency, (g) => g.balance)
  // remaining_amount is already the server-maintained, trigger-updated figure
  // (apply_debt_receivable_repayment()) — never recomputed from transactions here.
  const receivablesByCurrency = sumByCurrency(receivables, (r) => r.currency, (r) => r.remaining_amount)
  const debtsByCurrency = sumByCurrency(debts, (d) => d.currency, (d) => d.remaining_amount)

  const netWorthByCurrency = new Map(balanceByCurrency)
  for (const [currency, amount] of goalsByCurrency) {
    netWorthByCurrency.set(currency, (netWorthByCurrency.get(currency) ?? 0) + amount)
  }
  for (const [currency, amount] of receivablesByCurrency) {
    netWorthByCurrency.set(currency, (netWorthByCurrency.get(currency) ?? 0) + amount)
  }
  for (const [currency, amount] of debtsByCurrency) {
    netWorthByCurrency.set(currency, (netWorthByCurrency.get(currency) ?? 0) - amount)
  }

  // The Net Worth card only earns its place once it can actually differ from
  // the Total Balance card above — i.e. once there's a goal, debt, or
  // receivable in the picture, not just plain accounts.
  const showNetWorth = goals.length > 0 || debts.length > 0 || receivables.length > 0

  const incomeByCurrency = sumByCurrency(
    monthTransactions.filter((t) => t.type === 'income'),
    (t) => t.currency,
    (t) => t.amount,
  )
  const expenseByCurrency = sumByCurrency(
    monthTransactions.filter((t) => t.type === 'expense'),
    (t) => t.currency,
    (t) => t.amount,
  )
  const currenciesThisMonth = new Set([...incomeByCurrency.keys(), ...expenseByCurrency.keys()])

  const monthLabel = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Dashboard</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        {accounts.length === 0 ? (
          <p className="opacity-70">Add an account (Accounts tab) to see your balance here.</p>
        ) : (
          <>
            <IonCard className="bg-navy text-white">
              <IonCardContent>
                <p className="text-sm opacity-80 mb-1">Total balance</p>
                {[...balanceByCurrency.entries()].map(([currency, amount]) => (
                  <p key={currency} className="text-3xl font-bold">
                    {formatMoney(amount, currency)}
                  </p>
                ))}
              </IonCardContent>
            </IonCard>

            <IonCard>
              <IonCardContent>
                <IonCardSubtitle>{monthLabel}</IonCardSubtitle>
                {currenciesThisMonth.size === 0 ? (
                  <p className="opacity-70 mt-2">No transactions yet this month.</p>
                ) : (
                  [...currenciesThisMonth].map((currency) => {
                    const income = incomeByCurrency.get(currency) ?? 0
                    const expense = expenseByCurrency.get(currency) ?? 0
                    const net = income - expense
                    return (
                      <div key={currency} className="mt-2">
                        <div className="flex justify-between">
                          <span className="opacity-70">Income</span>
                          <span style={{ color: '#10b981' }}>{formatMoney(income, currency)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="opacity-70">Expense</span>
                          <span style={{ color: '#ef4444' }}>{formatMoney(expense, currency)}</span>
                        </div>
                        <div className="flex justify-between font-semibold mt-1 pt-1" style={{ borderTop: '1px solid rgba(0,0,0,0.1)' }}>
                          <span>Net</span>
                          <span style={{ color: net >= 0 ? '#10b981' : '#ef4444' }}>{formatMoney(net, currency)}</span>
                        </div>
                      </div>
                    )
                  })
                )}
              </IonCardContent>
            </IonCard>

            {showNetWorth && (
              <IonCard>
                <IonCardContent>
                  <IonCardTitle className="text-base">Net worth</IonCardTitle>
                  <p className="text-sm opacity-60 mb-2">
                    Accounts
                    {goals.length > 0 && ` + ${goals.length} goal${goals.length === 1 ? '' : 's'}`}
                    {receivables.length > 0 && ` + ${receivables.length} receivable${receivables.length === 1 ? '' : 's'}`}
                    {debts.length > 0 && ` − ${debts.length} debt${debts.length === 1 ? '' : 's'}`}
                  </p>
                  {[...netWorthByCurrency.entries()].map(([currency, amount]) => (
                    <p key={currency} className="text-xl font-semibold">
                      {formatMoney(amount, currency)}
                    </p>
                  ))}
                </IonCardContent>
              </IonCard>
            )}

            <IonCard>
              <IonCardContent>
                <IonCardSubtitle>Accounts</IonCardSubtitle>
                {accounts.map((a) => (
                  <div key={a.id} className="flex justify-between mt-2">
                    <span>{a.name}</span>
                    <span>{formatMoney(a.balance, a.currency)}</span>
                  </div>
                ))}
              </IonCardContent>
            </IonCard>
          </>
        )}
      </IonContent>
    </IonPage>
  )
}
