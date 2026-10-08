import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Session } from '@supabase/supabase-js'
import {
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { db, type Transaction } from '../lib/db'

type Period = 'this_month' | 'last_3' | 'last_6' | 'this_year'

const PERIOD_LABEL: Record<Period, string> = {
  this_month: 'This month',
  last_3: 'Last 3 months',
  last_6: 'Last 6 months',
  this_year: 'This year',
}

// A fallback palette for categories that were created before T010 started
// assigning colors, or for any future category type that doesn't set one —
// the pie chart still needs a color per slice regardless.
const FALLBACK_PALETTE = ['#0f766e', '#2563eb', '#d97706', '#dc2626', '#7c3aed', '#059669', '#db2777', '#4b5563']

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toLocaleString()} ${currency}`
  }
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

/** The first moment a period looks back to, as an ISO string comparable to `occurred_at`. */
function periodStart(period: Period): string {
  const now = new Date()
  switch (period) {
    case 'this_month':
      return startOfMonth(now).toISOString()
    case 'last_3':
      return new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString()
    case 'last_6':
      return new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()
    case 'this_year':
      return new Date(now.getFullYear(), 0, 1).toISOString()
  }
}

/** Sums `amount` per currency, so multi-currency data is never silently added together. */
function groupByCurrency(transactions: Transaction[]) {
  const byCurrency = new Map<string, Transaction[]>()
  for (const t of transactions) {
    const list = byCurrency.get(t.currency) ?? []
    list.push(t)
    byCurrency.set(t.currency, list)
  }
  return byCurrency
}

export function ReportsPage({ session }: { session: Session }) {
  const [period, setPeriod] = useState<Period>('this_month')

  // Re-renders live on any write to transactions/categories — local or pulled
  // down by a background sync — same reactive pattern as every other page
  // since the T011 live-query fix.
  const transactions = useLiveQuery(async () => {
    const all = await db.transactions.toArray()
    return all.filter((t) => t.user_id === session.user.id && !t.deleted_at)
  }, [session.user.id]) ?? []

  const categories = useLiveQuery(async () => {
    const all = await db.categories.toArray()
    return all.filter((c) => c.user_id === session.user.id && !c.deleted_at)
  }, [session.user.id]) ?? []

  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  // --- Spending by category, for the selected period ---
  const periodStartIso = periodStart(period)
  const periodExpenses = useMemo(
    () => transactions.filter((t) => t.type === 'expense' && t.occurred_at >= periodStartIso),
    [transactions, periodStartIso],
  )
  const expensesByCurrency = useMemo(() => groupByCurrency(periodExpenses), [periodExpenses])

  function categoryBreakdown(forCurrency: Transaction[]) {
    const totals = new Map<string, number>() // category_id ("uncategorized" fallback) -> amount
    for (const t of forCurrency) {
      const key = t.category_id ?? 'uncategorized'
      totals.set(key, (totals.get(key) ?? 0) + t.amount)
    }
    const total = [...totals.values()].reduce((sum, v) => sum + v, 0)
    return [...totals.entries()]
      .map(([categoryId, amount], index) => {
        const category = categoryId === 'uncategorized' ? undefined : categoriesById.get(categoryId)
        return {
          name: category?.name ?? 'Uncategorized',
          amount,
          percent: total > 0 ? (amount / total) * 100 : 0,
          color: category?.color ?? FALLBACK_PALETTE[index % FALLBACK_PALETTE.length],
        }
      })
      .sort((a, b) => b.amount - a.amount)
  }

  // --- Income vs expense trend, last 6 calendar months (fixed window, not tied to the period selector) ---
  const trendStartIso = useMemo(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()
  }, [])
  const trendTransactions = useMemo(
    () => transactions.filter((t) => t.occurred_at >= trendStartIso),
    [transactions, trendStartIso],
  )
  const trendByCurrency = useMemo(() => groupByCurrency(trendTransactions), [trendTransactions])

  function monthlyTrend(forCurrency: Transaction[]) {
    const now = new Date()
    const months: { key: string; label: string; income: number; expense: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString(undefined, { month: 'short' }),
        income: 0,
        expense: 0,
      })
    }
    const byKey = new Map(months.map((m) => [m.key, m]))
    for (const t of forCurrency) {
      const d = new Date(t.occurred_at)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      const bucket = byKey.get(key)
      if (!bucket) continue
      if (t.type === 'income') bucket.income += t.amount
      else bucket.expense += t.amount
    }
    return months
  }

  const hasAnyData = transactions.length > 0

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Reports</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        {!hasAnyData ? (
          <p className="opacity-70">Add some transactions first — reports will show up here once you have data.</p>
        ) : (
          <>
            <h2 className="text-lg font-semibold mb-2">Spending by category</h2>
            <IonSegment value={period} onIonChange={(e) => setPeriod((e.detail.value as Period) ?? 'this_month')}>
              {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
                <IonSegmentButton key={p} value={p}>
                  <IonLabel>{PERIOD_LABEL[p]}</IonLabel>
                </IonSegmentButton>
              ))}
            </IonSegment>

            {expensesByCurrency.size === 0 ? (
              <p className="opacity-70 ion-padding-top">No expenses in this period.</p>
            ) : (
              [...expensesByCurrency.entries()].map(([currency, txns]) => {
                const breakdown = categoryBreakdown(txns)
                return (
                  <div key={currency} className="mt-4">
                    {expensesByCurrency.size > 1 && <p className="text-sm opacity-60 mb-1">{currency}</p>}
                    <div style={{ width: '100%', height: 220 }}>
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie data={breakdown} dataKey="amount" nameKey="name" innerRadius={50} outerRadius={85}>
                            {breakdown.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => formatMoney(Number(value) || 0, currency)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <IonList>
                      {breakdown.map((entry) => (
                        <IonItem key={entry.name} lines="none">
                          <div
                            slot="start"
                            style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: entry.color }}
                          />
                          <IonLabel>{entry.name}</IonLabel>
                          <IonLabel slot="end" className="ion-text-end">
                            {formatMoney(entry.amount, currency)}
                            <p>{entry.percent.toFixed(0)}%</p>
                          </IonLabel>
                        </IonItem>
                      ))}
                    </IonList>
                  </div>
                )
              })
            )}

            <h2 className="text-lg font-semibold mt-6 mb-2">Income vs expense trend</h2>
            <p className="text-sm opacity-60 mb-2">Last 6 months</p>
            {trendByCurrency.size === 0 ? (
              <p className="opacity-70">No transactions in the last 6 months.</p>
            ) : (
              [...trendByCurrency.entries()].map(([currency, txns]) => (
                <div key={currency} className="mb-4" style={{ width: '100%', height: 240 }}>
                  {trendByCurrency.size > 1 && <p className="text-sm opacity-60 mb-1">{currency}</p>}
                  <ResponsiveContainer>
                    <BarChart data={monthlyTrend(txns)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
                      <YAxis width={40} tickFormatter={(v: number) => v.toLocaleString()} />
                      <Tooltip formatter={(value) => formatMoney(Number(value) || 0, currency)} />
                      <Legend />
                      <Bar dataKey="income" name="Income" fill="#10b981" />
                      <Bar dataKey="expense" name="Expense" fill="#ef4444" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ))
            )}
          </>
        )}
      </IonContent>
    </IonPage>
  )
}
