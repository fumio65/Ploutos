import Dexie, { type EntityTable } from 'dexie'

// ============================================================================
// Ploutos — Dexie (IndexedDB) local schema (T006)
//
// Mirrors supabase/migrations/0001_schema.sql field-for-field, so the sync
// layer (T007) can map local <-> remote rows without a translation layer.
//
// Conventions matching the Postgres schema:
//   - id: client-generated UUID (string), always the primary key
//   - user_id: present on every table, scopes rows to the signed-in user
//   - created_at / updated_at: ISO 8601 strings (stand-in for timestamptz)
//   - deleted_at: ISO 8601 string | undefined — soft delete, never hard-delete
//   - numeric(18,2) columns (amounts/balances) are stored as `number`
// ============================================================================

export interface Category {
  id: string
  user_id: string
  name: string
  kind: 'income' | 'expense'
  icon?: string
  color?: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface Account {
  id: string
  user_id: string
  name: string
  type: 'cash' | 'bank' | 'e_wallet' | 'other'
  currency: string
  balance: number
  icon?: string
  color?: string
  is_archived: boolean
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface Goal {
  id: string
  user_id: string
  name: string
  target_amount: number
  currency: string
  balance: number
  deadline?: string
  icon?: string
  color?: string
  is_archived: boolean
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface Transaction {
  id: string
  user_id: string
  account_id: string
  category_id?: string
  type: 'income' | 'expense'
  amount: number
  currency: string
  note?: string
  occurred_at: string
  debt_id?: string
  receivable_id?: string
  recurring_rule_id?: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface Transfer {
  id: string
  user_id: string
  // Exactly one of from_account_id / from_goal_id is set (see 0001_schema.sql
  // chk_transfer_from_one_source), same for the to_* pair.
  from_account_id?: string
  from_goal_id?: string
  to_account_id?: string
  to_goal_id?: string
  amount: number
  currency: string
  note?: string
  occurred_at: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface Debt {
  id: string
  user_id: string
  counterparty: string
  original_amount: number
  remaining_amount: number
  currency: string
  due_date?: string
  note?: string
  is_settled: boolean
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface Receivable {
  id: string
  user_id: string
  counterparty: string
  original_amount: number
  remaining_amount: number
  currency: string
  due_date?: string
  note?: string
  is_settled: boolean
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface Budget {
  id: string
  user_id: string
  category_id: string
  monthly_limit: number
  currency: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface RecurringRule {
  id: string
  user_id: string
  account_id: string
  category_id?: string
  type: 'income' | 'expense'
  amount: number
  currency: string
  note?: string
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval_count: number
  start_date: string
  end_date?: string
  next_run_date: string
  is_active: boolean
  created_at: string
  updated_at: string
  deleted_at?: string
}

// ----------------------------------------------------------------------------
// Sync-support tables (T007) — local-only, never pushed to Supabase
// ----------------------------------------------------------------------------

/** The nine syncable table names, shared by db.ts and sync.ts. */
export const SYNCABLE_TABLES = [
  'categories',
  'accounts',
  'goals',
  'transactions',
  'transfers',
  'debts',
  'receivables',
  'budgets',
  'recurring_rules',
] as const
export type SyncableTable = (typeof SYNCABLE_TABLES)[number]

/**
 * One entry per pending local change. Written whenever app code writes to a
 * syncable table while offline (or just generally, so the same push path
 * always applies). Multiple queued entries for the same record are fine —
 * the sync layer dedupes by (table_name, record_id) and only pushes the
 * record's current state once.
 */
export interface OutboxEntry {
  id?: number // Dexie auto-increment
  table_name: SyncableTable
  record_id: string
  queued_at: string
}

/** Per-table sync watermark: the `updated_at` of the newest row already pulled. */
export interface SyncMeta {
  table_name: SyncableTable
  last_synced_at: string
}

// ----------------------------------------------------------------------------
// Database definition
// ----------------------------------------------------------------------------
// Dexie's `stores` string lists only the INDEXED fields (not every column) —
// `&id` marks id as the unique primary key. Every table indexes user_id and
// updated_at: user_id for per-user scoping, updated_at because the T007 sync
// layer queries "everything changed since last_synced_at" per table.
// Tables also index whichever foreign keys the UI will filter/join on.

const db = new Dexie('ploutos') as Dexie & {
  categories: EntityTable<Category, 'id'>
  accounts: EntityTable<Account, 'id'>
  goals: EntityTable<Goal, 'id'>
  transactions: EntityTable<Transaction, 'id'>
  transfers: EntityTable<Transfer, 'id'>
  debts: EntityTable<Debt, 'id'>
  receivables: EntityTable<Receivable, 'id'>
  budgets: EntityTable<Budget, 'id'>
  recurring_rules: EntityTable<RecurringRule, 'id'>
  outbox: EntityTable<OutboxEntry, 'id'>
  sync_meta: EntityTable<SyncMeta, 'table_name'>
}

db.version(1).stores({
  categories: '&id, user_id, kind, updated_at, deleted_at',
  accounts: '&id, user_id, type, updated_at, deleted_at',
  goals: '&id, user_id, updated_at, deleted_at',
  transactions:
    '&id, user_id, account_id, category_id, debt_id, receivable_id, recurring_rule_id, occurred_at, updated_at, deleted_at',
  transfers:
    '&id, user_id, from_account_id, from_goal_id, to_account_id, to_goal_id, occurred_at, updated_at, deleted_at',
  debts: '&id, user_id, is_settled, updated_at, deleted_at',
  receivables: '&id, user_id, is_settled, updated_at, deleted_at',
  budgets: '&id, user_id, category_id, updated_at, deleted_at',
  recurring_rules: '&id, user_id, account_id, next_run_date, is_active, updated_at, deleted_at',
})

// Version 2 (T007): add the local-only outbox + sync watermark tables.
// Bumping the version (rather than editing version(1).stores) is required —
// IndexedDB only applies schema changes through an explicit version upgrade,
// and any table not re-listed here is carried over unchanged from v1.
db.version(2).stores({
  outbox: '++id, table_name, record_id, queued_at',
  sync_meta: '&table_name',
})

export { db }
