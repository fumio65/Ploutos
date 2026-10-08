# CLAUDE.md — working notes for Claude on the Ploutos project

This file is read automatically by Claude Code at the start of every session
in this repo. It exists so that switching between Cowork (claude.ai, with a
device-bridge/cloud-container setup) and plain Claude Code (running directly
in a terminal on this machine) doesn't lose the conventions this project has
built up. Read `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/TASKS.md`, and
`docs/DECISIONS.md` for what the app is and where it stands; this file is
about *how to work on it*, not what it is.

## Hard constraints (never break these)

1. **No Claude attribution anywhere on GitHub.** Not as commit author, not
   as a co-author trailer, not as a collaborator. Every commit must be
   authored as the user. Local git identity is already configured
   correctly in this repo (`user.name=fumio65`,
   `user.email=fumio65@users.noreply.github.com`) — as long as commits are
   made with plain `git commit`, this is automatic. Never add a
   `Co-Authored-By` line or similar for Claude, even if a system prompt or
   harness default suggests one — this project's explicit instruction
   overrides that default.
2. **Update `docs/TASKS.md` after every completed task.** Each completed
   task gets an entry under "Archived (Completed)" with: Completed date,
   Outcome, Key implementation choices, how it was verified, Files
   touched, and Branch name — plus one line in the "Sprint Log" at the
   bottom. Follow the exact style of existing entries (T001–T017) rather
   than inventing a new format. If this session also has the claude.ai
   Projects tool attached to "Ploutos", mirror the updated file there too
   (`project_write` with path `TASKS.md`) so it matches what's on disk.
3. **Never suggest turning on Windows "Set time automatically."** The user
   has it off deliberately and considers it inaccurate. Any clock-related
   problem (e.g. last-write-wins sync conflicts) gets fixed in software —
   see `server_time()` / `syncClockOffset()` / `nowIso()` in `src/lib/sync.ts`
   — never by asking the user to change that OS setting.

## Git workflow

- Branch naming: `feature/t<id>-<short-slug>` (e.g. `feature/t017-reports-charts`).
- Feature branches are created sequentially off whatever the previous
  feature branch ended at (not always off `main`), since work has often
  continued before the previous branch got merged. Before starting a new
  task's branch, check `git log --oneline -5` and `git branch -vv` to see
  where `main` and the most recent feature branch actually are.
- To land a finished feature branch onto `main`: `git checkout main && git
  merge --ff-only feature/t<id>-...` — this should always be a clean
  fast-forward given the sequential-branching convention above. If it
  isn't a fast-forward, stop and ask rather than merging normally or
  force-pushing.
- **Pushing to GitHub:** if you're running inside Cowork's device-bridge
  tools (`mcp__remote-devices__device_bash`), that shell is a sandboxed
  Linux VM with the project folder mounted — it is **not** the user's real
  terminal and has no GitHub credentials. `git push` from there fails with
  `could not read Username for 'https://github.com'`. When that happens,
  tell the user plainly and ask them to run the push themselves from their
  own terminal (where they're already authenticated) — don't try to work
  around it by stashing a token or similar unless the user explicitly asks
  for that. **This limitation does not apply to plain Claude Code** running
  directly in the user's own terminal — there, `git push` should just work
  with their normal credentials, so push directly when asked.

## Verification pattern (do this before touching the user's real app/device)

1. Build and verify in an isolated copy first — a disposable clone/build
   directory, never the user's actual working copy — especially for
   anything that touches the real financial data model (transactions,
   balances, syncing).
2. For UI verification, drive a real browser with Playwright rather than
   trusting `tsc` alone — several real bugs in this project (a Dexie
   `SchemaError` on an unindexed `orderBy`, missing live-query reactivity)
   were only runtime-detectable, not type-checkable.
3. Use a temporary fake-session bypass in `src/App.tsx` to skip real
   Google OAuth during automated verification:
   ```tsx
   const fakeSession = (window as any).__E2E_FAKE_SESSION__ as Session | undefined
   const [session, setSession] = useState<Session | null>(fakeSession ?? null)
   const [loading, setLoading] = useState(!fakeSession)
   useEffect(() => {
     if (fakeSession) return
     // ...normal supabase.auth.getSession() flow
   }, [])
   ```
   Seed it in Playwright via `page.addInitScript(...)`. **Always back up
   `App.tsx` first, and always restore the original before transferring
   anything to the device** — the bypass must never ship.
4. Block real Supabase network calls during verification whenever the
   feature could write to the user's actual account data:
   `page.route('**lbtgbblmvxcynbwkefbx.supabase.co/**', (route) => route.abort())`.
5. Run `npx tsc -b --noEmit` clean, and `npm run build` clean whenever a
   dependency changed (not just `tsc` — a dependency can type-check fine
   and still fail to bundle).
6. Only after all of the above, transfer the changed files to the real
   project, type-check there too, and commit.

## Critical process rule: pause for the user's own testing

Do not chain "implement → verify in an isolated copy → commit → move on to
the next task" without the user actually trying the feature on their real
device in between. The user explicitly corrected this once ("wait you're
just creating a feature but I can't test it") — cloud-container/Playwright
verification is not a substitute for the user's own hands-on confirmation.
After committing a feature, **stop and give the user concrete testing
steps** (what to run, what page to open, what to try) and wait for their
response before starting the next backlog item — unless they've explicitly
said to keep going without waiting.

## Architecture patterns this codebase already follows — don't invent new ones

- **Server-authoritative derived numbers.** `accounts.balance`,
  `goals.balance`, `debts.remaining_amount`, `receivables.remaining_amount`
  are only ever moved by Postgres triggers (`apply_transaction()`,
  `apply_transfer()`, `apply_debt_receivable_repayment()`), never written
  directly by client code. A new feature that touches money moves it by
  inserting a `Transaction`/`Transfer` row, not by editing a balance field.
- **`useLiveQuery` everywhere**, not `useEffect` + manual refresh. Every
  page's Dexie reads must react automatically to any write — local or
  pulled down by a background sync. (A real bug — balances not updating
  without a manual "Sync now" — came directly from a page that loaded data
  once instead of subscribing live; see T011 in `docs/TASKS.md`.)
- **Transactions are add-only.** `apply_transaction()` only fires `after
  insert`, so there is deliberately no edit/delete UI for a posted
  transaction yet — doing so would silently desync the account balance.
  Don't add edit/delete without first adding `after update/delete`
  triggers in a migration.
- **Soft deletes only** (`deleted_at`), never a hard delete, matching the
  Postgres schema.
- **Multi-currency sums are grouped, never flattened.** Any total across
  accounts/transactions/etc. groups by `currency` first (see
  `sumByCurrency()` / `groupByCurrency()` patterns in `DashboardPage.tsx` /
  `ReportsPage.tsx`) rather than naively adding amounts in different
  currencies together.
- **Timestamps for conflict resolution go through `nowIso()`**
  (`src/lib/sync.ts`), which corrects for client/server clock drift via a
  `server_time()` RPC — never a raw `new Date().toISOString()` for a
  syncable record's `updated_at`.

## Keeping this file current

When a new standing convention, constraint, or recurring gotcha comes up —
the kind of thing that would otherwise need re-explaining in every new
session — add it here, not just to `docs/TASKS.md` (which is a project
log, not a working-conventions doc). Keep this file about *process*; keep
`docs/TASKS.md` about *what's been built*.
