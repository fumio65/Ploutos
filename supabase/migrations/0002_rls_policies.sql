-- ============================================================================
-- Ploutos — Row Level Security policies (T003)
-- Target: Supabase (Postgres 15+)
-- Depends on: 0001_schema.sql
-- Review before applying. Apply via `supabase db push` or as a migration file
-- in supabase/migrations/.
--
-- Pattern: every table is scoped to user_id = auth.uid(), for all four
-- operations. No table is readable/writable across users, and no table
-- allows anonymous (unauthenticated) access.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- categories
-- ----------------------------------------------------------------------------
alter table categories enable row level security;

create policy "categories_select_own" on categories
  for select using (auth.uid() = user_id);

create policy "categories_insert_own" on categories
  for insert with check (auth.uid() = user_id);

create policy "categories_update_own" on categories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "categories_delete_own" on categories
  for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- accounts
-- ----------------------------------------------------------------------------
alter table accounts enable row level security;

create policy "accounts_select_own" on accounts
  for select using (auth.uid() = user_id);

create policy "accounts_insert_own" on accounts
  for insert with check (auth.uid() = user_id);

create policy "accounts_update_own" on accounts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "accounts_delete_own" on accounts
  for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- goals
-- ----------------------------------------------------------------------------
alter table goals enable row level security;

create policy "goals_select_own" on goals
  for select using (auth.uid() = user_id);

create policy "goals_insert_own" on goals
  for insert with check (auth.uid() = user_id);

create policy "goals_update_own" on goals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "goals_delete_own" on goals
  for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- transactions
-- ----------------------------------------------------------------------------
alter table transactions enable row level security;

create policy "transactions_select_own" on transactions
  for select using (auth.uid() = user_id);

create policy "transactions_insert_own" on transactions
  for insert with check (auth.uid() = user_id);

create policy "transactions_update_own" on transactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "transactions_delete_own" on transactions
  for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- transfers
-- ----------------------------------------------------------------------------
alter table transfers enable row level security;

create policy "transfers_select_own" on transfers
  for select using (auth.uid() = user_id);

create policy "transfers_insert_own" on transfers
  for insert with check (auth.uid() = user_id);

create policy "transfers_update_own" on transfers
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "transfers_delete_own" on transfers
  for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- debts
-- ----------------------------------------------------------------------------
alter table debts enable row level security;

create policy "debts_select_own" on debts
  for select using (auth.uid() = user_id);

create policy "debts_insert_own" on debts
  for insert with check (auth.uid() = user_id);

create policy "debts_update_own" on debts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "debts_delete_own" on debts
  for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- receivables
-- ----------------------------------------------------------------------------
alter table receivables enable row level security;

create policy "receivables_select_own" on receivables
  for select using (auth.uid() = user_id);

create policy "receivables_insert_own" on receivables
  for insert with check (auth.uid() = user_id);

create policy "receivables_update_own" on receivables
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "receivables_delete_own" on receivables
  for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- budgets
-- ----------------------------------------------------------------------------
alter table budgets enable row level security;

create policy "budgets_select_own" on budgets
  for select using (auth.uid() = user_id);

create policy "budgets_insert_own" on budgets
  for insert with check (auth.uid() = user_id);

create policy "budgets_update_own" on budgets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "budgets_delete_own" on budgets
  for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- recurring_rules
-- ----------------------------------------------------------------------------
alter table recurring_rules enable row level security;

create policy "recurring_rules_select_own" on recurring_rules
  for select using (auth.uid() = user_id);

create policy "recurring_rules_insert_own" on recurring_rules
  for insert with check (auth.uid() = user_id);

create policy "recurring_rules_update_own" on recurring_rules
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "recurring_rules_delete_own" on recurring_rules
  for delete using (auth.uid() = user_id);

-- ============================================================================
-- Verification notes (manual test, run once applied to a real project):
--
-- 1. Create two test users, A and B, via Supabase Auth.
-- 2. As A (using A's JWT), insert a row into `accounts`.
-- 3. As B (using B's JWT), run `select * from accounts` — A's row must NOT
--    appear.
-- 4. As B, attempt `update accounts set balance = 0 where user_id = '<A's id>'`
--    — must affect 0 rows (RLS silently filters, it does not error).
-- 5. Repeat steps 2-4 for at least one more table (e.g. `transactions`) to
--    confirm the pattern holds across tables, not just the one tested.
--
-- These checks satisfy T003's acceptance criteria and should be run against
-- the actual deployed Supabase project in T005, since RLS cannot be
-- meaningfully tested without real auth.uid() sessions (local schema review
-- alone does not prove enforcement).
-- ============================================================================
