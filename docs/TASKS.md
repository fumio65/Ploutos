# TASKS.md — Current Sprint

**Phase:** 1 — Core UI
**Sprint goal:** A usable app shell: navigate between accounts, transactions, and a dashboard, with real data flowing through Dexie + the T007 sync layer. Phase 0 (T001-T007, data model + sync) is complete and archived below.
**Started:** 2026-10-08
**Branch naming convention:** `feature/t<id>-<short-slug>`

---

## Sprint Backlog

### T010 — Categories seed data + management UI
- [ ] Not started
- **Depends on:** T008
- **Context:** Seed a sensible default category set (income + expense) on first sign-in if none exist yet, plus a simple list/add/edit screen for user-defined categories. Needed before T012 (transactions need a category to pick from).
- **Acceptance criteria:** New user gets default categories automatically; can add/edit/delete a custom category.
- **Expected branch:** `feature/t010-categories-ui`

### T012 — Transaction entry + list UI
- [ ] Not started
- **Depends on:** T009, T010
- **Context:** Add/edit income or expense transactions (amount, date, account, category, note); list view per account and a combined recent-activity list. Transaction writes must update the account balance via the existing Postgres trigger (`apply_transaction()`) — client side just inserts the transaction row and lets sync carry it; Dexie-side balance display should re-derive from local account record after sync, not be computed client-side, to avoid drift from the server-authoritative trigger logic.
- **Acceptance criteria:** Add a transaction offline; account balance updates after sync; list shows correct amount/date/category/account.
- **Expected branch:** `feature/t012-transactions-ui`

### T013 — Dashboard screen
- [ ] Not started
- **Depends on:** T009, T012
- **Context:** Balance overview across accounts, income vs. expense snapshot (e.g. this month), optional Net Worth view (accounts + goals balances combined, per the T001 goals design).
- **Acceptance criteria:** Numbers shown reconcile with the underlying transaction/account data (no orphaned numbers, per PRD.md's success metric).
- **Expected branch:** `feature/t013-dashboard`

---

## Up Next (not in this sprint)
- Category budgets UI + logic
- Recurring transactions engine
- Debt/receivable tracking UI
- Goals UI (T011 — unblocked now that T001 is resolved; reserved ID, deliberately not in this sprint)
- Reports/charts
- Native Google sign-in flow for Capacitor build
- AI Q&A: Edge Function + tool-calling query layer (v2)

## Archived (Completed)

### T009 — Accounts list + create/edit UI ✅
- **Completed:** 2026-10-08
- **Outcome:** Real CRUD screen for `accounts` in `src/pages/AccountsPage.tsx`: Active/Archived segmented list, swipe-to-archive and swipe-to-restore (`IonItemSliding`), a FAB to open a create form (name, type, currency, opening balance, color swatch), and tap-to-edit (name/type/currency/color only — balance is deliberately not editable after creation, see below).
- **Key implementation choices:**
  - All writes go through the same `db.accounts.put(...)` + `queueChange('accounts', id)` pattern the T007 sync-test harness established, so every create/edit/archive/restore is already sync-correct with no new logic needed in `sync.ts`.
  - Editing an existing account cannot change its `balance`. Only account creation sets an opening balance. This matches where the data model is headed: once T012 (transactions) lands, `balance` becomes derived (maintained server-side by the `apply_transaction()`/`apply_transfer()` triggers from T002), so letting the UI edit it directly after creation would let the client silently disagree with the server-authoritative value. The edit form shows a one-line note explaining this instead of a disabled input, so it doesn't read as a bug.
  - Icon picker was scoped out for now (color swatch only) — six preset colors cover the "visually distinguish your accounts" need without building a full icon-asset picker before there's more than one screen that would use it.
- **Bug found and fixed during verification:** `refresh()` initially called `db.accounts.orderBy('name').toArray()`, which throws a Dexie `SchemaError` (`KeyPath name on object store accounts is not indexed`) at runtime — `name` isn't one of the indexed fields in `db.ts`'s `accounts` store (only `id`/`user_id`/`type`/`updated_at`/`deleted_at` are). `tsc` doesn't catch this (it's a runtime-only Dexie check), which is exactly why it was caught by actually running the page, not just type-checking it. Fixed by sorting in JS (`toArray()` then `.sort(...)`) instead of bumping the IndexedDB schema version just for display ordering.
- **Verified before touching the device:** full CRUD cycle driven by Playwright in the cloud container (same fake-session-bypass technique as T008, removed afterward) — create an account, confirm it appears with formatted balance, edit/rename it, archive it (confirmed it disappears from Active), confirm it appears in Archived, restore it (confirmed it disappears from Archived and reappears in Active). Zero page errors after the orderBy fix. `tsc -b --noEmit` clean in both the cloud container and the user's machine.
- **Acceptance criteria:** ✅ Met — confirmed by the user on their machine: create/edit/archive/restore all work, balance display is correct, syncs through the existing T007 layer.
- **Files:** `src/pages/AccountsPage.tsx`, `src/navigation/Tabs.tsx` (passes `session` through to `AccountsPage`).
- **Expected branch:** `feature/t009-accounts-ui`

### T008 — App navigation shell (Ionic tabs) ✅
- **Completed:** 2026-10-08
- **Outcome:** Real navigation shell replacing the T004-T007 demo `App.tsx`. Four-tab `IonTabs`/`IonRouterOutlet` shell (Dashboard, Accounts, Transactions, More) under `/tabs/*`, with the sign-in gate (`SignInPage`) staying in front of it in `App.tsx` exactly as before. The T007 "Sync layer test" harness was moved to `pages/DevSyncTestPage.tsx`, reachable via More → "Dev: Sync layer test" at `/tabs/more/dev-sync-test`, rather than deleted.
- **Key implementation choices:**
  - `react-router-dom` v6 syntax throughout (`<Route path="..." element={<X/>} />`, `<Navigate to="..." replace />`) — the older `Redirect`/children-based `<Route>` API shown in some still-circulating Ionic examples doesn't exist in v6 (confirmed: `react-router-dom` v6.30 exports `Navigate`, not `Redirect`). `Tabs.tsx` uses relative child paths (`"dashboard"`, `"more/dev-sync-test"`) under a parent `<Route path="/tabs/*">`, which is the correct RRv6 nested-routing pattern and works cleanly with Ionic 9's `IonRouterOutlet`/`IonTabs`.
  - Added `src/lib/syncContext.tsx` (`SyncProvider`/`useSync()`): the sync listeners (`startSyncListeners`) now start once for the whole authenticated app shell (mounted in `AppShell`), not per-page. `DevSyncTestPage` reads `syncResult`/`syncing`/`syncNow` from this context instead of managing its own sync lifecycle — avoids re-arming listeners every time that page is opened, and gives any future page (e.g. a "last synced" indicator) the same shared state.
  - `MorePage` uses `useNavigate()` (RRv6), not `useHistory()` (RRv5) — another API that changed between versions and needs to be gotten right per-component.
- **Verified before touching the device:** built a temporary fake-session bypass in the fast cloud container and drove the real browser with Playwright (not just `tsc`) — clicked through all four tabs, into the nested `/tabs/more/dev-sync-test` route and back via the Ionic back button, confirmed URLs and rendered content matched expectations at each step, and confirmed zero console/page errors. Removed the temporary bypass before transferring anything to the device. `tsc -b --noEmit` also clean both in the cloud container and on the user's machine.
- **Acceptance criteria:** ✅ Met — confirmed by the user on their machine: tab bar renders with all four tabs, navigation works, sync-test harness works from its new location under More.
- **Files:** `src/App.tsx` (now just the auth gate), `src/AppShell.tsx` (new), `src/navigation/Tabs.tsx` (new), `src/pages/{SignInPage,DashboardPage,AccountsPage,TransactionsPage,MorePage,DevSyncTestPage}.tsx` (new), `src/lib/syncContext.tsx` (new).
- **Expected branch:** `feature/t008-nav-shell`

### T007 — Sync layer (outbox + watermark) ✅
- **Completed:** 2026-10-08
- **Outcome:** `src/lib/sync.ts` implements the full offline sync layer: `queueChange()` (marks a record dirty in the local `outbox` table), `pushOutbox()` (drains the outbox, last-write-wins per record against the live remote row), `pullTable()` (pulls anything changed remotely since each table's `sync_meta.last_synced_at` watermark), and `runSync()` (push-then-pull across all nine syncable tables, wired to fire on the browser's `online` event and once on app start via `startSyncListeners()`). Verified against a real Supabase project with a manual test harness in `App.tsx` ("Sync layer test" card): create-offline-then-sync, local-edit-wins, and remote-edit-wins were each demonstrated against live data, with the final local/remote state checked directly via SQL to confirm (not just trusting the UI).
- **Key implementation choices:**
  - Conflict resolution is purely by `updated_at` comparison (`>` for push, `>=` for pull — ties favor local), no vector clocks or per-field merging. Matches ARCHITECTURE.md's documented last-write-wins design; acceptable for a single-user app where "conflicts" mostly mean the same user editing from two devices, not concurrent multi-user writes.
  - `pushOutbox()` dedupes queued entries by `(table, record_id)` before pushing — only the record's *current* local state is sent once, not every intermediate edit — and always reads the record fresh from Dexie at push time (never from the outbox entry itself), so multiple edits queued before a sync still resolve correctly.
  - A losing push doesn't just get discarded — the newer remote row is pulled down and overwrites the local one, so the local copy is never left stale after losing a conflict.
- **Bug found and fixed during verification — client/server clock drift breaks last-write-wins:**
  - The conflict test ("local edit should win when it's the later edit, in real time") failed twice in a row: `pushOutbox` kept reporting the remote row as newer even when the local edit was made several seconds *after* the remote edit, in real wall-clock time.
  - Root cause: the original code stamped local edits with the browser's own `new Date().toISOString()`, then compared that string directly against Postgres's `updated_at` (set by the `set_updated_at()` trigger using the **server's** clock). This assumes the two clocks agree. They don't have to — a user's OS clock can run minutes off from true/server time for any reason, with zero relation to how recently they actually made an edit. When the local clock runs behind the server's, local edits look "older" than they really are, so remote wins conflicts it shouldn't.
  - **Fix:** added a `server_time()` Postgres function (`supabase/migrations/0004_server_time_rpc.sql`, just `select now()`, granted to `authenticated`/`anon`) and a `syncClockOffset()` function in `sync.ts` that calls it via `supabase.rpc('server_time')` once per `runSync()`, measuring `offset = serverTime − localTime` (using the round-trip midpoint to approximate network latency) and caching it. A new `nowIso()` helper (`new Date(Date.now() + offset).toISOString()`) replaces every raw `new Date().toISOString()` used for a syncable record's `updated_at` — in `queueChange()`, and in `App.tsx`'s test-harness writes. This makes conflict resolution robust to an inaccurate device clock without requiring the user to fix their OS clock settings (the user deliberately keeps automatic time sync off, so correcting for drift in software rather than asking them to change that was the right call here, and is also simply the more correct architecture regardless).
  - **Secondary fix, found while diagnosing the above:** `startSyncListeners()` had no guard against two syncs running concurrently (e.g. the automatic `online`-event/startup trigger overlapping a manual "Sync now" click). An overlapping pair can race — one call's pull can read a record before the other call's push/pull writes it, then write its own now-stale decision on top, silently discarding a legitimate push. Added `runSyncExclusive()`, which returns the in-flight sync's promise instead of starting a second overlapping one if a sync is already running; both the automatic listeners and the manual "Sync now" button now go through it.
  - **Lesson for future sync/timestamp work on this project:** never compare a client-stamped timestamp directly against a server-stamped one without measuring and correcting for clock offset first — this applies to any future feature that does last-write-wins or "most recent" logic across the client/server boundary (e.g. recurring-rule `next_run_date` checks, if those ever get client-side pre-computation).
- **Acceptance criteria:** ✅ Met.
  - Create a record offline → go online → appears in Supabase: confirmed (verified directly via SQL, not just the UI).
  - Later edit wins regardless of which side made it: confirmed both directions after the clock-offset fix — local-wins (`pushed 1, remote-won 0`) and remote-wins (`pushed 0, pulled 1`, local balance matching the remote value exactly) both reproduced cleanly and repeatably.
- **Files:** `src/lib/sync.ts`, `supabase/migrations/0004_server_time_rpc.sql`, `src/App.tsx` (test harness), `src/lib/db.ts` (unchanged, already had the `outbox`/`sync_meta` tables from T006).
- **Expected branch:** `feature/t007-sync-layer`

### T006 — Dexie.js local schema ✅
- **Completed:** 2026-10-08
- **Outcome:** `src/lib/db.ts` defines a Dexie (IndexedDB) database (`ploutos`) with the same nine tables as `0001_schema.sql`: `categories`, `accounts`, `goals`, `transactions`, `transfers`, `debts`, `receivables`, `budgets`, `recurring_rules`. Every field name and shape matches the Postgres columns 1:1 (timestamptz → ISO string, numeric(18,2) → number, uuid → string, nullable columns → optional TS fields), so the T007 sync layer can map rows without a translation layer, per the task's acceptance criteria.
- **Key implementation choices:**
  - A TypeScript interface per table (`Category`, `Account`, `Goal`, `Transaction`, `Transfer`, `Debt`, `Receivable`, `Budget`, `RecurringRule`) gives the local store the same type safety Postgres's `check` constraints give the remote one (e.g. `type: 'income' | 'expense'` mirrors the `check (type in (...))` constraint).
  - Dexie's `stores()` index list is deliberately not "every column" — only `user_id`, `updated_at`, `deleted_at`, and whichever foreign keys the UI will filter/join on (e.g. `account_id` on `transactions`, `from_goal_id`/`to_goal_id` on `transfers`) are indexed. `updated_at` is indexed on every table specifically because T007's sync pull step queries "everything changed since `last_synced_at`" per table.
  - `transfers` keeps the same four nullable FK columns (`from_account_id`/`from_goal_id`/`to_account_id`/`to_goal_id`) as the Postgres table, preserving the T001 goals design (a transfer's source/target can be an account or a goal) at the local-schema level too — the `chk_transfer_from_one_source`/`chk_transfer_to_one_target` constraints aren't enforceable in IndexedDB, so that invariant will need to be checked in application code when T007/the UI writes transfer records.
- **Verified:** Type-checked (`tsc -b --noEmit`) with zero errors, both in a separate clean build and on the user's own machine after `npm install dexie`. No native bindings in `dexie` (pure JS), so none of the T004/T005 bridge-install issues applied here.
- **File:** `src/lib/db.ts`

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
- 2026-10-08: Project pushed to GitHub (`github.com/fumio65/Ploutos`, `main`, commit `d4dd226`) — docs, schema/RLS migrations, and the full scaffold. Authored as the user (`fumio65`), no Claude attribution. `node_modules` and `.env.local` correctly excluded via `.gitignore`.
- 2026-10-08: T006 completed — `src/lib/db.ts` defines the Dexie local schema, a 1:1 field match with all nine Postgres tables from T002. Type-checked clean in a separate build and on the user's machine after `npm install dexie`; no bridge/install issues since dexie is pure JS with no native bindings. T007 (sync layer) is now fully unblocked — both its dependencies (T005, T006) are done.
- 2026-10-08: T007 completed — sync layer (`src/lib/sync.ts`) verified end to end against the live Supabase project. Found and fixed a real bug during verification: client/server clock drift was breaking last-write-wins (a local edit's browser-stamped timestamp was being compared directly against Postgres's server-stamped one with no offset correction). Added a `server_time()` RPC + `syncClockOffset()`/`nowIso()` in `sync.ts` to correct for this, plus a `runSyncExclusive()` guard against overlapping sync runs. Both conflict directions (local-wins, remote-wins) now reproduce cleanly and repeatably. All of Phase 0 (T001-T007) is now complete — sprint backlog is empty; next up is picking the first item from "Up Next" (Core UI is the natural starting point).
- 2026-10-08: T008 completed — real four-tab navigation shell (Dashboard/Accounts/Transactions/More) replacing the demo App.tsx, built on react-router-dom v6 syntax (confirmed the older Redirect/children-based Route API from some Ionic examples doesn't exist in v6 — verified empirically with Playwright in a disposable cloud-container build before touching the device, not just by reading docs). Sync listeners now live in a shared SyncProvider/useSync() context instead of per-page. T009 (accounts list UI) is next up.
- 2026-10-08: T009 completed — Accounts CRUD UI (src/pages/AccountsPage.tsx): create/edit/archive/restore, all wired through the existing queueChange/sync pattern with no new sync logic needed. Found and fixed a runtime-only Dexie SchemaError (orderBy on a non-indexed field) that tsc couldn't have caught — caught because the page was actually run with Playwright before being sent to the device, not just type-checked. Balance is deliberately not editable after account creation, since it becomes server-derived once T012 lands. T010 (categories) is next up.
