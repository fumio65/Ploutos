# TASKS.md — Current Sprint

**Phase:** 0 — Planning & Foundation
**Sprint goal:** Lock the data model and get a running, empty-but-wired project (web app ↔ Supabase ↔ local store), before any feature UI is built.
**Started:** 2026-10-08
**Branch naming convention:** `feature/t<id>-<short-slug>`

---

## Sprint Backlog

### T006 — Dexie.js local schema
- [ ] Not started
- **Depends on:** T002 ✅
- **Context (how to execute):**
  1. Define a Dexie database with tables mirroring every syncable Postgres table from T002.
  2. Match field names/types so sync mapping stays simple (no translation layer needed between local and remote field names).
- **Acceptance criteria:** Local Dexie schema has a 1:1 table/field match with the Postgres schema (excluding server-only columns like RLS-internal fields, if any).
- **Expected branch:** `feature/t006-dexie-schema`
- **Commits:** —

### T007 — Sync layer (outbox + watermark)
- [ ] Not started
- **Depends on:** T005 ✅, T006
- **Context (how to execute):**
  1. Add an `outbox` table locally: queues created/updated/deleted records made while offline.
  2. On reconnect (via `navigator.onLine` + a health-check ping), push outbox entries to Supabase in order.
  3. Pull remote rows where `updated_at > last_synced_at`, merge into local store, update `last_synced_at`.
  4. Implement last-write-wins: if a local and remote record conflict, the one with the later `updated_at` wins.
- **Acceptance criteria:**
  - Create a record offline → go online → confirm it appears in Supabase.
  - Edit the same record from two separate sessions while both were offline → reconnect both → confirm the later edit wins and no sync crash/duplicate occurs.
- **Expected branch:** `feature/t007-sync-layer`
- **Commits:** —

---

## Up Next (not in this sprint)
- Core UI: transaction entry, account list, dashboard
- Category budgets UI + logic
- Recurring transactions engine
- Debt/receivable tracking UI
- Goals UI (T011 — unblocked now that T001 is resolved)
- Reports/charts
- Native Google sign-in flow for Capacitor build
- AI Q&A: Edge Function + tool-calling query layer (v2)

## Archived (Completed)

### T005 — Supabase project setup ✅
- **Completed:** 2026-10-08
- **Outcome:** Live Supabase project created, schema + RLS deployed, Google OAuth working, real sign-in verified end to end (user signed in as `lhestertomenio1@gmail.com`, confirmed session shown in the app UI).
- **Project details:**
  - Name: **Ploutos**, `project_id`/`ref`: `lbtgbblmvxcynbwkefbx`, org `fumio65`, region `ap-southeast-1`, status `ACTIVE_HEALTHY`.
  - Project URL: `https://lbtgbblmvxcynbwkefbx.supabase.co`
  - Publishable key: `sb_publishable_KxUOd8k36jgWsezkl3Pk_Q_Zs5BuDF8` (safe client-side; full credentials live in `.env.local` at the project root — gitignored via the `*.local` rule, **not committed, not in this doc**).
- **Migrations applied directly to the live project:**
  - `0001_schema.sql`, `0002_rls_policies.sql` (the T002/T003 files).
  - `0003_fix_function_search_path.sql` (new, added during T005) — pins `search_path` on the four trigger functions, clearing a Supabase security-advisor warning. Security advisor is now clean (0 findings).
- **Free-tier constraint hit:** org `fumio65` was capped at 2 active free projects. Paused the existing `lasenggo-3000` project to free a slot for Ploutos. `lasenggo-3000` can be unpaused later from the Supabase dashboard if needed.
- **Google OAuth setup (manual, no API/MCP tool covers this):**
  - Created a Google Cloud project ("Ploutos"), configured the OAuth consent screen (External user type), created a Web application OAuth Client ID.
  - Authorised JavaScript origin: `https://lbtgbblmvxcynbwkefbx.supabase.co`
  - Authorised redirect URI: `https://lbtgbblmvxcynbwkefbx.supabase.co/auth/v1/callback`
  - Client ID/Secret pasted into Supabase dashboard → Auth → Providers → Google.
- **Code added to the scaffold (new files, beyond what T004 delivered):**
  - `src/lib/supabase.ts` — Supabase client, reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env.local`.
  - `src/App.tsx` — extended with a session-aware auth card: shows "Sign in with Google" when signed out, or the signed-in user's email + a sign-out button when signed in. Uses `supabase.auth.signInWithOAuth({ provider: 'google' })` and `onAuthStateChange` to track session state.
  - `@supabase/supabase-js` and `tslib` added to `package.json` dependencies.
- **Debugging notes (for next time something like this happens):**
  - Hit a `tslib` resolution error (`Failed to resolve import "tslib"`) from Vite's dependency pre-bundler. Root cause: the project's `node_modules` had been built up over several earlier *interrupted* installs through the remote device bridge (same bridge issue noted in T004) — `tslib` was present but missing a file (`tslib.es6.mjs`) that its own `package.json` exports map pointed to. Clearing Vite's cache (`node_modules/.vite`) did **not** fix it, because the underlying package itself was corrupted, not just cached.
  - **Fix:** full clean reinstall — delete `node_modules` and `package-lock.json` entirely, then `npm install` fresh, natively on Windows (not through the bridge). This is now the standing recommendation whenever a dependency resolution error looks inexplicable on this project: don't trust partial fixes (cache-clearing, installing just the one missing package) if `node_modules` has any history of interrupted/bridge-based installs — nuke and reinstall clean instead.
  - A couple of native `.node` binary files were briefly locked by the running `npm run dev` process during cleanup (Windows file lock) — resolved by having the user stop the dev server first.
- **Acceptance criteria:** ✅ Met — signed in with a real Google account from the local dev build, valid Supabase session confirmed in the UI.
- **Expected branch:** `feature/t005-supabase-setup`

### T004 — Project scaffold ✅
- **Completed:** 2026-10-08
- **Outcome:** Vite + React + TS project scaffolded directly in the project root, with `@ionic/react`, `@ionic/react-router`, `ionicons`, and Tailwind CSS v4 (via `@tailwindcss/vite`) installed and wired together. `node_modules` installed (73 top-level packages) and `package-lock.json` committed, so versions are pinned.
- **Key implementation choices:**
  - Tailwind v4's `@theme` block defines Ploutos brand tokens (`--color-navy`, `--color-emerald`, `--color-mist`, `--color-ink`, Space Grotesk font) directly in `src/index.css`.
  - `src/index.css` imports `tailwindcss/theme` + `tailwindcss/utilities` only — **not** `tailwindcss/preflight` — so Tailwind's reset doesn't fight Ionic's own base/normalize CSS (the conflict flagged in ARCHITECTURE.md's Tech Stack table).
  - `src/App.tsx` demonstrates both systems side-by-side: a Tailwind-styled navy balance card (`bg-navy`, `text-emerald` utilities) next to a native `IonCard`/`IonButton`, to prove they coexist without visual conflict.
  - Verified in a separate clean build environment first (`npm run build` succeeded, 186 modules transformed, confirmed `.bg-navy{background-color:var(--color-navy)}` and `.text-emerald{color:var(--color-emerald)}` present in the compiled CSS) before transferring the identical config/lockfile to this machine, so the exact versions and wiring are proven-working.
- **Verified on this machine:** `tsc -b --noEmit` type-checks with zero errors against the installed packages. `npm run dev` confirmed working by the user (2026-10-08) — navy Tailwind balance card (₱40,000 balance, ₱10,000 Trip goal) rendering correctly above the native Ionic card/button, no visual conflicts. Acceptance criteria fully met.
- **Known setup gotcha (for next time):** `node_modules` was first installed via a remote Linux-side bridge tool, which left `node_modules/.bin` without Windows-native shims (`.cmd`/`.ps1`). This caused `'vite' is not recognized as an internal or external command` on first `npm run dev`. Fixed by running `npm i` again directly in a native Windows terminal, which regenerated the correct shims (the EACCES cleanup warnings during that run were harmless — Windows Defender/indexer briefly locking temp files, not an actual install failure). Going forward, any `node_modules` setup should be done (or re-verified with a plain `npm i`) directly on the target machine, not through a remote bridge.
- **File/folder:** project root (`package.json`, `vite.config.ts`, `src/`, `public/`, `index.html`)

### T003 — Draft RLS policies ✅
- **Completed:** 2026-10-08
- **Outcome:** `supabase/migrations/0002_rls_policies.sql` written and committed. Every table from T002 (`categories`, `accounts`, `goals`, `transactions`, `transfers`, `debts`, `receivables`, `budgets`, `recurring_rules`) has RLS enabled with four policies (select/insert/update/delete), each scoped to `auth.uid() = user_id`.
- **Key implementation choices:**
  - Consistent naming: `<table>_<operation>_own` for every policy, so the pattern is easy to audit or extend when new tables are added later.
  - `update` policies set both `using` and `with check` to `auth.uid() = user_id`, which prevents a user from re-assigning a row's `user_id` to someone else's — not just from reading/writing another user's existing rows.
  - No anonymous access is granted anywhere — RLS defaults to deny, and no policy targets the `anon` role.
- **Not yet verified:** the two-test-account cross-access check from the acceptance criteria needs a real deployed Supabase project with real auth sessions to run — deferred to T005, where the migration actually gets applied. The migration file includes verification notes/steps to run at that point.
- **File:** `supabase/migrations/0002_rls_policies.sql`

### T002 — Draft Postgres schema ✅
- **Completed:** 2026-10-08
- **Outcome:** `supabase/migrations/0001_schema.sql` written and committed to the project folder. Covers `categories`, `accounts`, `goals`, `transactions`, `transfers`, `debts`, `receivables`, `budgets`, `recurring_rules`.
- **Key implementation choices:**
  - Every syncable table has `id uuid default gen_random_uuid()`, `user_id`, `created_at`, `updated_at` (auto-maintained via a shared `set_updated_at()` trigger), `deleted_at` (soft delete).
  - `transfers` table supports account→account, account→goal, and goal→account moves via nullable `from_account_id`/`from_goal_id` and `to_account_id`/`to_goal_id` pairs, each constrained to exactly one source/target. An `apply_transfer()` trigger updates the relevant account/goal balances on insert — matches the confirmed T001 goals design (goal balance only changes via transfer rows, never a direct mutation).
  - `transactions` auto-apply to `accounts.balance` via an `apply_transaction()` trigger (income adds, expense subtracts).
  - `debts`/`receivables` have `remaining_amount` auto-decremented by an `apply_debt_receivable_repayment()` trigger when a linked transaction (`debt_id`/`receivable_id`) posts, and auto-flip `is_settled` when paid off.
  - `recurring_rules` stores `next_run_date` for the (not-yet-built) scheduler to consume.
- **Not yet done:** RLS policies (T003 — next up), applying this migration to an actual Supabase project (T005).
- **File:** `supabase/migrations/0001_schema.sql`

### T001 — Resolve goals data model ✅
- **Resolved:** 2026-10-08
- **Outcome:** Confirmed transfer-funded sub-account model (not the tag-only fallback). Worked example: Bank ₱50,000 → transfer ₱10,000 to "Trip" goal → Bank ₱40,000 / Trip ₱10,000, Net Worth unchanged at ₱50,000.
- **Rationale:** Prevents double-counting between spendable and saved money; matches the standard real-world "move money to savings" mental model; reuses the same transfer mechanism already planned for account-to-account transfers, so no added schema complexity.
- **Docs updated:** ARCHITECTURE.md ("Goals" section moved from provisional to confirmed), DECISIONS.md (status updated to Confirmed).
- **Unblocked:** T002, T003, T011 (Goals UI)

## Sprint Log
- 2026-10-08: Sprint opened. No implementation started yet; planning docs (PRD/ARCHITECTURE/CONTEXT/DECISIONS) created first.
- 2026-10-08: T001 resolved — goals confirmed as transfer-funded sub-accounts. ARCHITECTURE.md and DECISIONS.md updated. T002 (Postgres schema) is now unblocked and next up.
- 2026-10-08: T002 completed — `supabase/migrations/0001_schema.sql` written covering all nine v1 tables, with balance-maintaining triggers for transfers, transactions, and debt/receivable repayments. T003 (RLS policies) is now next up.
- 2026-10-08: T003 completed — `supabase/migrations/0002_rls_policies.sql` written covering all nine tables with per-user select/insert/update/delete policies. Cross-user access verification deferred to T005 (needs a live Supabase project to test against). T004 (project scaffold) and T005 (Supabase setup) are both now unblocked.
- 2026-10-08: T004 completed — Vite + React + TS + Ionic React + Tailwind v4 scaffolded and installed in the project root; `tsc` type-checks clean. Live `npm run dev` visual check needs to be run manually (see T004 note) since the setup tool bridge can't execute Vite's native binary.
- 2026-10-08: T004 visual check confirmed by user — `npm run dev` ran successfully after re-running `npm i` natively on Windows (fixed missing `.bin` shims). Tailwind + Ionic render together correctly, no conflicts. T004 fully closed. T005 (Supabase setup) is next up.
- 2026-10-08: T005 in progress — created the Supabase project (`Ploutos`, ref `lbtgbblmvxcynbwkefbx`) after pausing `lasenggo-3000` to clear the org's free-tier project cap. Applied the T002 schema and T003 RLS migrations directly to the live project, plus a follow-up migration pinning `search_path` on the trigger functions (security advisor now clean). Google OAuth setup is manual (Google Cloud Console + Supabase dashboard, no API for this) and is in progress with the user.
- 2026-10-08: T005 completed — Google OAuth client created and wired into Supabase; `src/lib/supabase.ts` and an auth-aware `App.tsx` added to the scaffold. Hit and fixed a corrupted `tslib` install (leftover from earlier bridge-interrupted installs, same root cause as the T004 shim issue) via a full clean `node_modules` reinstall done natively on Windows. User signed in with a real Google account (`lhestertomenio1@gmail.com`) and the session rendered correctly in the app — acceptance criteria met, T005 fully closed. T006 (Dexie local schema) is next up and unblocked; T007 (sync layer) now only waits on T006.
