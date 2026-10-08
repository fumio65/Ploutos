# ARCHITECTURE.md — Ploutos

> Current build status / active sprint: see TASKS.md

## Brand & Theme
- **Name:** Ploutos (see PRD.md "Name & Story" for the full rationale)
- **Theme:** Modern Minimal (confirmed, chosen from 3 explored directions — Classical Gold, Modern Minimal, Warm Mediterranean)
- **Palette:** Navy `#1E2A5A` (primary/brand) · Emerald `#10B981` (accent — positive amounts, active states) · Mist `#F5F6FA` (background) · Ink `#0E1330` (dark text/dark-mode base)
- **Typography:** Space Grotesk, used throughout (headings and body) — geometric, modern sans
- **Icon/logomark (confirmed):** Cornucopia — Ploutos's own mythological symbol (the horn of plenty), drawn as a single simplified line-art swoop. Used as the app icon (navy tile, white stroke) and as the signature mark in the logo lockup. Chosen over a generic coin/"P" monogram because it ties directly to the brand story rather than reading as generic fintech iconography; holds up at small sizes (tested down to 28px) since it's one continuous shape.
- **Logo lockup:** horizontal — cornucopia mark in a rounded navy (or emerald, on dark backgrounds) tile, next to the lowercase wordmark "ploutos" in Space Grotesk Bold. Variants: light background (navy mark + navy text), dark background (emerald mark + white text), stacked (mark above wordmark, for splash/about screens), and mark-alone (app icon, favicon).
- **UI pattern established in the explored prototype:** a navy balance card at the top of the dashboard with a Wallet/Net Worth toggle, white rounded cards for income/expense summaries, goal progress, and recent transactions

## Tech Stack
| Layer | Choice | Rationale |
|---|---|---|
| Frontend framework | React + Vite + TypeScript | Static SPA output drops cleanly into Capacitor; Next.js avoided (SSR model conflicts with Capacitor's static-bundle approach) |
| UI components | Ionic React (`@ionic/react`) | Native-feeling components (tab bars, action sheets) from day one; no UI rework when wrapping in Capacitor |
| Styling | Tailwind CSS | Custom layout/spacing on top of Ionic components. Note: Tailwind `preflight` can clash with Ionic's base styles — disable or scope preflight |
| Routing | React Router (via `@ionic/react-router`) | Standard pairing with Ionic React |
| Local state/data | Dexie.js (IndexedDB wrapper) | Offline-first source of truth for the UI while on web; migrate to `@capacitor-community/sqlite` when wrapped, or keep Dexie in the WebView |
| Backend | Supabase (Postgres + Auth + RLS + Realtime) | Relational schema fits financial data; RLS scopes data per user; Google OAuth built in |
| Packaging | Capacitor | Converts the web app into iOS/Android shells |
| AI | LLM via Supabase Edge Function (tool-calling pattern) | Keeps API keys server-side; online-only by design |
| Charts | recharts (v3) | Spending-by-category + income/expense trend reports (T017); React 19-compatible |
| Capacitor core | `@capacitor/core` | Added T018 to make `Capacitor.isNativePlatform()` callable from `SignInPage`; no Android/iOS platforms or plugins installed yet — see "Google sign-in" below |

## System Overview (text diagram)

```
[React + Ionic UI]
        |
        v
[Dexie/IndexedDB]  <-- always the first read/write target (offline-first)
        |
        v  (sync when online)
[Sync Layer: outbox + watermark]
        |
        v
[Supabase: Postgres + RLS + Auth]
        |
        v
[Edge Function] --> [LLM API]   (AI Q&A, online-only)
```

- UI never talks to Supabase directly for core data — always through the local store, with sync happening in the background.
- AI requests are the one path that goes online-only, client → Edge Function → LLM, with the Edge Function querying Postgres (scoped by RLS) for the numbers the AI reports on.

## Offline Sync Design
- Every syncable table has: `id` (client-generated UUID), `updated_at`, `deleted_at` (soft delete, no hard deletes)
- Local "outbox": changes made offline are queued; on reconnect, push queued changes, then pull anything newer than `last_synced_at`
- Conflict resolution: last-write-wins by `updated_at` (sufficient for a single-user app; documented tradeoff — simultaneous multi-device edits to the same record will favor the later timestamp)
- Connectivity detection: `navigator.onLine` + an active health-check ping (the browser `online` event alone is unreliable)

## Data Model Relationships

### Accounts (Wallets)
- Spendable balances: cash, bank, e-wallet
- Multi-currency: each account has a currency; no cross-currency conversion in v1
- Transactions (income/expense) post directly against an account
- Transfers move money between two accounts, or between an account and a goal

### Goals — **CONFIRMED (T001)**
- Goals are **transfer-funded sub-accounts**: each goal has a target amount, a deadline, and its own current balance (separate from any account's balance).
- Funded/withdrawn via the same transfer mechanism used for account-to-account transfers — a transfer from an account to a goal reduces that account's balance and increases the goal's balance by the same amount (and vice versa for a withdrawal).
- Rationale: keeps wallet balances representing true spendable money — once money is moved into a goal, it's "set aside" and no longer shows as available to spend, the same way moving money into a real savings account would. This also avoids double-counting (money can't simultaneously be "available to spend" and "saved toward a goal").
- Worked example (confirmed 2026-10-08): Bank starts at ₱50,000. User creates a "Trip" goal with a ₱10,000 target and transfers ₱10,000 from Bank into it. Result: Bank balance → ₱40,000, Trip goal balance → ₱10,000. Net Worth is unchanged (₱50,000 total), since the goal balance now contributes to it instead of the account balance.
- Resolved **T001** in TASKS.md — unblocks T002 (schema), T003 (RLS), and T011 (Goals UI).

### Debt & Receivables
- **Debt** (user owes someone): counterparty, amount, due date. Repayment = an expense transaction from an account, which reduces the debt balance.
- **Receivable** (someone owes user): counterparty, amount, due date. Repayment received = an income transaction into an account, which reduces the receivable balance.
- No separate balance-container needed — both are trackers linked to ordinary transactions. Confirmed design.

### Net Worth
`Net Worth = sum(account balances) + sum(goal balances) + sum(receivables) − sum(debts)`
Confirmed. Displayed as an optional toggle view separate from the default wallet-balance view.

### Budgets
- Category budgets: a monthly limit per category, compared against the sum of expense transactions in that category for the current month

### Recurring Transactions
- A template (amount, category, account, frequency) that generates real transaction records on schedule

## Google Sign-In: Web vs Native
- Web: `supabase.auth.signInWithOAuth({ provider: 'google', ... })` — a browser redirect round-trip. Unchanged, in `src/pages/SignInPage.tsx`.
- Native (Capacitor build, not yet set up): `SignInPage` branches on `Capacitor.isNativePlatform()` and calls `signInWithGoogleNative()` (`src/lib/nativeAuth.ts`), which documents the eventual flow (native Google Sign-In plugin → ID token → `supabase.auth.signInWithIdToken(...)`) and throws until that plugin and the Capacitor Android/iOS projects actually exist. Added as a prep step (T018) — see DECISIONS.md.

## Key Design Patterns
- **Feature-based architecture**: organize code by feature (accounts, transactions, budgets, goals, debts, ai-insights) rather than by technical layer
- **Local-first data flow**: UI reads/writes local store only; sync is a background concern, never blocking user actions
- **Tool-calling for AI**, not raw SQL generation: the LLM calls predefined, safe query functions (e.g. `get_spending_by_category(start, end)`) rather than generating arbitrary SQL — avoids injection/correctness risk against financial data
- **Multi-currency aggregates are always grouped by currency, never flattened.** Any total spanning records that could be in different currencies (Dashboard's balance/net-worth/income-expense cards, Reports' category breakdown and trend charts) groups by `currency` first and renders one figure/chart per currency rather than silently adding, say, PHP and USD together.

## Engineering Standards (carried from source planning doc)
- Feature-based architecture
- Git & GitHub workflow
- Clean code / optimization
- Security as a hard requirement (RLS on every table, no client-side secrets)
- Error tracking & logging
- CI/CD
- Rate limiting (especially around AI Edge Function calls)
- Monitoring
- Recovery/backup strategy
- Caching/CDN (relevant once reports/dashboards scale)
- Load balancing (deferred — not relevant until real scale)

## Open Questions
- Multi-currency Net Worth conversion — deferred to v2, no exchange-rate infra in v1

## Schema & Policies
Applied to the live Supabase project (`lbtgbblmvxcynbwkefbx`). Source of truth is `supabase/migrations/`, not this file:
- `0001_schema.sql` (T002) — the nine v1 tables (`categories`, `accounts`, `goals`, `transactions`, `transfers`, `debts`, `receivables`, `budgets`, `recurring_rules`) plus the balance-maintaining triggers (`apply_transaction()`, `apply_transfer()`, `apply_debt_receivable_repayment()`).
- `0002_rls_policies.sql` (T003) — per-user select/insert/update/delete policies on every table.
- `0003_fix_function_search_path.sql` (T005) — pins `search_path` on the trigger functions (security-advisor fix).
- `0004_server_time_rpc.sql` (T007) — `server_time()` RPC, used by the sync layer's clock-drift correction.

See `docs/TASKS.md` (T002/T003/T005/T007) for the story behind each migration; keep this list in sync whenever a new migration is added rather than letting it go stale again.
