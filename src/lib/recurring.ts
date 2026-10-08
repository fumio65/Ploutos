import { db, type RecurringRule, type Transaction } from './db'
import { nowIso, queueChange } from './sync'

// ============================================================================
// Ploutos — Recurring transactions engine (T015)
//
// There's no server-side cron; this is a purely client-driven scheduler.
// Each recurring_rules row tracks its own next_run_date, so "running" it
// just means: for every active rule whose next_run_date has arrived, insert
// a real transaction row (same apply_transaction() trigger path as a
// manually-entered one in T012) and advance next_run_date past today.
//
// Catch-up: if the app wasn't opened for a while, a rule can be overdue by
// more than one period. The loop below keeps generating one transaction per
// elapsed period until next_run_date is back in the future (or past
// end_date, in which case the rule deactivates) — so reopening the app
// after two weeks away correctly backfills two missed weekly entries rather
// than silently skipping to "now" and losing them.
// ============================================================================

/** Safety cap on catch-up iterations per rule, in case of a malformed/ancient next_run_date. */
const MAX_CATCH_UP_RUNS = 500

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Advances a YYYY-MM-DD date string by one period of the rule's frequency. */
export function addInterval(dateStr: string, frequency: RecurringRule['frequency'], intervalCount: number): string {
  // Anchor at noon local time (same trick as T012's date input) so the
  // field-level date math below can't shift a day via a UTC/DST edge.
  const d = new Date(`${dateStr}T12:00:00`)
  switch (frequency) {
    case 'daily':
      d.setDate(d.getDate() + intervalCount)
      break
    case 'weekly':
      d.setDate(d.getDate() + intervalCount * 7)
      break
    case 'monthly':
      d.setMonth(d.getMonth() + intervalCount)
      break
    case 'yearly':
      d.setFullYear(d.getFullYear() + intervalCount)
      break
  }
  return d.toISOString().slice(0, 10)
}

export function frequencyLabel(frequency: RecurringRule['frequency'], intervalCount: number): string {
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[frequency]
  if (intervalCount === 1) return `Every ${unit}`
  return `Every ${intervalCount} ${unit}s`
}

/**
 * Finds every recurring rule whose next_run_date has arrived and inserts
 * the transactions it generated (catching up on any missed periods), then
 * advances each rule's next_run_date and deactivates it once end_date has
 * passed. Returns how many transactions were created.
 *
 * Safe to call on every app start — rules not yet due are left untouched.
 */
export async function runDueRecurringRules(userId: string): Promise<number> {
  const today = todayDateString()
  const rules = await db.recurring_rules.toArray()
  const due = rules.filter((r) => !r.deleted_at && r.is_active && r.next_run_date <= today)

  let created = 0
  for (const rule of due) {
    let nextRun = rule.next_run_date
    let guard = 0

    while (nextRun <= today && (!rule.end_date || nextRun <= rule.end_date) && guard < MAX_CATCH_UP_RUNS) {
      const now = nowIso()
      const txn: Transaction = {
        id: crypto.randomUUID(),
        user_id: userId,
        account_id: rule.account_id,
        category_id: rule.category_id,
        type: rule.type,
        amount: rule.amount,
        currency: rule.currency,
        note: rule.note,
        occurred_at: new Date(`${nextRun}T12:00:00`).toISOString(),
        recurring_rule_id: rule.id,
        created_at: now,
        updated_at: now,
      }
      // Insert only — apply_transaction() fires after insert and moves the
      // account balance on push, same as a manually entered transaction.
      await db.transactions.put(txn)
      await queueChange('transactions', txn.id)
      created++
      guard++

      nextRun = addInterval(nextRun, rule.frequency, rule.interval_count)
    }

    const pastEnd = rule.end_date ? nextRun > rule.end_date : false
    const updated: RecurringRule = {
      ...rule,
      next_run_date: nextRun,
      is_active: pastEnd ? false : rule.is_active,
      updated_at: nowIso(),
    }
    await db.recurring_rules.put(updated)
    await queueChange('recurring_rules', updated.id)
  }

  return created
}

// Reentrancy guard: AppShell calls this once per mount, but React can remount
// quickly (StrictMode, fast navigation) and nothing stops two overlapping
// calls from both reading the same stale next_run_date and double-posting —
// so a second call while one is still in flight reuses its promise instead
// of starting a parallel run, the same pattern as sync.ts's runSyncExclusive.
let runningPromise: Promise<number> | null = null

export function runDueRecurringRulesOnce(userId: string): Promise<number> {
  if (runningPromise) return runningPromise
  runningPromise = runDueRecurringRules(userId).finally(() => {
    runningPromise = null
  })
  return runningPromise
}
