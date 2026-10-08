-- ============================================================================
-- Ploutos — Postgres schema (T002)
-- Target: Supabase (Postgres 15+)
-- Review before applying. Apply via `supabase db push` or as a migration file
-- in supabase/migrations/.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- Shared trigger: auto-update `updated_at` on every row change
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ----------------------------------------------------------------------------
-- categories
-- User-defined transaction categories (income or expense).
-- ----------------------------------------------------------------------------
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('income', 'expense')),
  icon text,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger trg_categories_updated_at
  before update on categories
  for each row execute function set_updated_at();

create index if not exists idx_categories_user_id on categories(user_id);

-- ----------------------------------------------------------------------------
-- accounts
-- Spendable wallets: cash, bank, e-wallet. Multi-currency, no conversion.
-- ----------------------------------------------------------------------------
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('cash', 'bank', 'e_wallet', 'other')),
  currency text not null, -- ISO 4217 code, e.g. 'PHP', 'USD'
  balance numeric(18, 2) not null default 0,
  icon text,
  color text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger trg_accounts_updated_at
  before update on accounts
  for each row execute function set_updated_at();

create index if not exists idx_accounts_user_id on accounts(user_id);

-- ----------------------------------------------------------------------------
-- goals
-- Transfer-funded sub-accounts (CONFIRMED T001). Balance only ever changes
-- via rows in `transfers` — never mutated directly by application code.
-- ----------------------------------------------------------------------------
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(18, 2) not null check (target_amount > 0),
  currency text not null,
  balance numeric(18, 2) not null default 0,
  deadline date,
  icon text,
  color text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger trg_goals_updated_at
  before update on goals
  for each row execute function set_updated_at();

create index if not exists idx_goals_user_id on goals(user_id);

-- ----------------------------------------------------------------------------
-- transactions
-- Income/expense entries posted directly against an account.
-- ----------------------------------------------------------------------------
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  type text not null check (type in ('income', 'expense')),
  amount numeric(18, 2) not null check (amount > 0),
  currency text not null,
  note text,
  occurred_at timestamptz not null default now(),
  -- links a transaction to a debt/receivable repayment (nullable; see debts/receivables)
  debt_id uuid,
  receivable_id uuid,
  -- links a transaction to the recurring rule that generated it (nullable)
  recurring_rule_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger trg_transactions_updated_at
  before update on transactions
  for each row execute function set_updated_at();

create index if not exists idx_transactions_user_id on transactions(user_id);
create index if not exists idx_transactions_account_id on transactions(account_id);
create index if not exists idx_transactions_category_id on transactions(category_id);
create index if not exists idx_transactions_occurred_at on transactions(occurred_at);

-- ----------------------------------------------------------------------------
-- transfers
-- Moves money between two accounts, or between an account and a goal.
-- Exactly one of (from_account_id, from_goal_id) and one of
-- (to_account_id, to_goal_id) must be set.
-- ----------------------------------------------------------------------------
create table if not exists transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_account_id uuid references accounts(id) on delete cascade,
  from_goal_id uuid references goals(id) on delete cascade,
  to_account_id uuid references accounts(id) on delete cascade,
  to_goal_id uuid references goals(id) on delete cascade,
  amount numeric(18, 2) not null check (amount > 0),
  currency text not null,
  note text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chk_transfer_from_one_source check (
    (from_account_id is not null)::int + (from_goal_id is not null)::int = 1
  ),
  constraint chk_transfer_to_one_target check (
    (to_account_id is not null)::int + (to_goal_id is not null)::int = 1
  ),
  constraint chk_transfer_not_self check (
    from_account_id is distinct from to_account_id
    or from_account_id is null
  )
);

create trigger trg_transfers_updated_at
  before update on transfers
  for each row execute function set_updated_at();

create index if not exists idx_transfers_user_id on transfers(user_id);
create index if not exists idx_transfers_from_account on transfers(from_account_id);
create index if not exists idx_transfers_to_account on transfers(to_account_id);
create index if not exists idx_transfers_from_goal on transfers(from_goal_id);
create index if not exists idx_transfers_to_goal on transfers(to_goal_id);

-- Keep account/goal balances in sync with transfers.
-- NOTE: this trigger only HANDLES INSERT (the common case: transfers are
-- immutable once created in the app's UX). If transfer edits/deletes are
-- ever allowed, this function must be extended to reverse the old amounts.
create or replace function apply_transfer()
returns trigger as $$
begin
  if new.from_account_id is not null then
    update accounts set balance = balance - new.amount where id = new.from_account_id;
  elsif new.from_goal_id is not null then
    update goals set balance = balance - new.amount where id = new.from_goal_id;
  end if;

  if new.to_account_id is not null then
    update accounts set balance = balance + new.amount where id = new.to_account_id;
  elsif new.to_goal_id is not null then
    update goals set balance = balance + new.amount where id = new.to_goal_id;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_transfers_apply
  after insert on transfers
  for each row execute function apply_transfer();

-- Keep account balances in sync with transactions.
create or replace function apply_transaction()
returns trigger as $$
begin
  if new.type = 'income' then
    update accounts set balance = balance + new.amount where id = new.account_id;
  else
    update accounts set balance = balance - new.amount where id = new.account_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_transactions_apply
  after insert on transactions
  for each row execute function apply_transaction();

-- ----------------------------------------------------------------------------
-- debts
-- Money the user owes to someone else. Reduced by linked expense transactions.
-- ----------------------------------------------------------------------------
create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  counterparty text not null,
  original_amount numeric(18, 2) not null check (original_amount > 0),
  remaining_amount numeric(18, 2) not null,
  currency text not null,
  due_date date,
  note text,
  is_settled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger trg_debts_updated_at
  before update on debts
  for each row execute function set_updated_at();

create index if not exists idx_debts_user_id on debts(user_id);

alter table transactions
  add constraint fk_transactions_debt
  foreign key (debt_id) references debts(id) on delete set null;

-- ----------------------------------------------------------------------------
-- receivables
-- Money someone else owes the user. Reduced by linked income transactions.
-- ----------------------------------------------------------------------------
create table if not exists receivables (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  counterparty text not null,
  original_amount numeric(18, 2) not null check (original_amount > 0),
  remaining_amount numeric(18, 2) not null,
  currency text not null,
  due_date date,
  note text,
  is_settled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger trg_receivables_updated_at
  before update on receivables
  for each row execute function set_updated_at();

create index if not exists idx_receivables_user_id on receivables(user_id);

alter table transactions
  add constraint fk_transactions_receivable
  foreign key (receivable_id) references receivables(id) on delete set null;

-- Keep debts/receivables remaining_amount in sync with linked repayment txns.
create or replace function apply_debt_receivable_repayment()
returns trigger as $$
begin
  if new.debt_id is not null and new.type = 'expense' then
    update debts set remaining_amount = remaining_amount - new.amount,
                      is_settled = (remaining_amount - new.amount) <= 0
      where id = new.debt_id;
  end if;

  if new.receivable_id is not null and new.type = 'income' then
    update receivables set remaining_amount = remaining_amount - new.amount,
                            is_settled = (remaining_amount - new.amount) <= 0
      where id = new.receivable_id;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_transactions_debt_receivable
  after insert on transactions
  for each row execute function apply_debt_receivable_repayment();

-- ----------------------------------------------------------------------------
-- budgets
-- A monthly limit per category.
-- ----------------------------------------------------------------------------
create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  monthly_limit numeric(18, 2) not null check (monthly_limit > 0),
  currency text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, category_id)
);

create trigger trg_budgets_updated_at
  before update on budgets
  for each row execute function set_updated_at();

create index if not exists idx_budgets_user_id on budgets(user_id);

-- ----------------------------------------------------------------------------
-- recurring_rules
-- Template that generates real transaction rows on a schedule.
-- ----------------------------------------------------------------------------
create table if not exists recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  type text not null check (type in ('income', 'expense')),
  amount numeric(18, 2) not null check (amount > 0),
  currency text not null,
  note text,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  interval_count int not null default 1 check (interval_count > 0),
  start_date date not null,
  end_date date,
  next_run_date date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger trg_recurring_rules_updated_at
  before update on recurring_rules
  for each row execute function set_updated_at();

create index if not exists idx_recurring_rules_user_id on recurring_rules(user_id);
create index if not exists idx_recurring_rules_next_run on recurring_rules(next_run_date) where is_active;

alter table transactions
  add constraint fk_transactions_recurring_rule
  foreign key (recurring_rule_id) references recurring_rules(id) on delete set null;

-- ============================================================================
-- End of T002. RLS policies are drafted separately in T003's migration file
-- (rls_policies.sql) so this schema file stays focused on structure.
-- ============================================================================
