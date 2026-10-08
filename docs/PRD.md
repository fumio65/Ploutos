# PRD.md — Ploutos

> Current build status / active sprint: see TASKS.md

## Name & Story
**Ploutos** — named after the Greek god of wealth and abundance. In myth, Zeus struck Ploutos blind so he would distribute wealth impartially, without favoring the virtuous over the wicked — explaining why wealth so often seems to land on people at random, disconnected from merit. The app's purpose is to give Ploutos his sight back: turning blind, scattered wealth into something visible, intentional, and well-managed for one person's own finances.

Brand theme: **Modern Minimal** (confirmed) — navy + emerald accent, coin/"P" monogram icon. See ARCHITECTURE.md "Brand & Theme" for the full spec.

## Objective
A personal finance tracker, built web-first and packaged into a native mobile app via Ionic Capacitor. Offline-first: core functionality works without a connection, syncing to the cloud when online.

## Core Objectives
- Track income, expenses, and transfers across multiple accounts/wallets
- Track debt owed by the user and money owed to the user (receivables)
- Support category-based budgets and personal savings goals
- Work fully offline, sync automatically when back online
- Sign in with Google
- Let the user ask natural-language questions about their own spending/income (AI, online-only)

## Key Features (v1)
1. **Transactions** — income/expense, amount, date, category, account, note
2. **Categories** — default set + user-defined custom categories
3. **Accounts / Wallets** — multi-currency, no auto-conversion (each currency tracked separately)
4. **Transfers** — move money between accounts (and between accounts and goals)
5. **Category budgets** — monthly spending limit per category
6. **Recurring transactions** — auto-repeating income/expense entries
7. **Debt tracker** — money the user owes, linked to repayment transactions
8. **Receivables** — money owed to the user, linked to incoming payment transactions
9. **Personal goals** — target amount + deadline; funded via transfers from accounts (provisional design, pending T001 — see ARCHITECTURE.md and TASKS.md)
10. **Reports/charts** — spending by category, trends over time
11. **Dashboard** — balance overview, income vs. expense snapshot, optional "Net Worth" view
12. **Google sign-in** (Supabase Auth)
13. **Offline-first sync** (local store ↔ Supabase)

## Deferred (v2 / nice-to-have, not yet scoped)
- AI spending Q&A — confirmed direction: online-only, answers questions against the user's own data (see ARCHITECTURE.md for proposed approach)
- Receipt photo scanning
- Data export (CSV/PDF)
- Notifications/reminders
- Currency conversion for unified Net Worth

## Success Metrics
- User can fully manage transactions, accounts, budgets, debts, and goals with zero network connection, with changes syncing correctly once back online
- No data loss or duplicate records across offline/online transitions
- Net Worth and account balances always reconcile with transaction history (no orphaned numbers)

## Constraints
- Solo-built, website-first, Capacitor-wrapped later — architecture must not assume native-only APIs for core features
- AI features require connectivity by design (no local model)
- Must support multiple currencies without requiring exchange-rate infrastructure in v1
