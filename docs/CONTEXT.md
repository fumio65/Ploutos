# CONTEXT.md — Ploutos

## Project Status
Phase: **2 — Extended Features** (see TASKS.md for the active sprint, task IDs, and the full Sprint Log). Phase 0 (foundation: schema, RLS, sync layer) and Phase 1 (core UI: accounts, transactions, dashboard, goals) are both complete and live against a real Supabase project; Phase 2 has shipped category budgets, recurring transactions, debt/receivable tracking, reports/charts, native-sign-in branching prep, and AI Q&A. The original PRD.md backlog is now fully built — TASKS.md's "Up Next" is empty. Conversion to native app (via Capacitor) remains a planned future phase (the sign-in code is branch-ready, T018, but no Capacitor project/native platforms exist yet), not current work.

## Terminology
- **Ploutos** — the project/app name, after the Greek god of wealth (see PRD.md "Name & Story").
- **Account / Wallet** — a spendable money source (cash, bank, e-wallet). Used interchangeably in discussion; schema uses `accounts`.
- **Goal** — a savings target with a deadline, modeled as a transfer-funded sub-account (confirmed, T001 — see ARCHITECTURE.md "Goals").
- **Debt** — money the user owes to someone else.
- **Receivable** — money someone else owes to the user.
- **Net Worth** — accounts + goals + receivables − debts. A toggleable view, not the default wallet balance shown day-to-day.
- **Outbox** — local queue of changes made offline, pushed to Supabase on reconnect.
- **Watermark** — the `last_synced_at` timestamp used to determine what to pull from the server during sync.

## Conventions
- IDs: client-generated UUIDs (not DB auto-increment) — required for offline record creation before sync
- Soft deletes only (`deleted_at` column) — never hard-delete rows, since sync needs to detect deletions
- Every syncable table requires `updated_at` for conflict resolution (last-write-wins)

## External Resources
- Supabase docs: https://supabase.com/docs
- Ionic React docs: https://ionicframework.com/docs/react
- Capacitor docs: https://capacitorjs.com/docs
- Dexie.js docs: https://dexie.org

## Known Open Questions / Blockers
- **Goals data model — resolved 2026-10-08 (T001).** Confirmed as transfer-funded sub-accounts; see ARCHITECTURE.md "Goals" and DECISIONS.md.
- **AI Q&A (T019) secret is set; live-testing fix (T019-fix) deployed, not yet confirmed.** The user set the `GEMINI_API_KEY` secret and began testing, hit a recurring Gemini 503 "high demand" error on `gemini-3.8-flash`; fixed with retry-with-backoff + a 3-model fallback chain, redeployed as function version 3. Waiting on the user to retry a question and confirm it actually answers correctly end to end before `feature/t019-ai-qa` is merged to `main`.
- No other open blockers as of T019-fix. Repo is live at `github.com/fumio65/Ploutos`; see TASKS.md for the branch naming convention (`feature/t<id>-<slug>`) and current state.

## Source Material
This planning structure (PRD/ARCHITECTURE/CONTEXT/TASKS split) follows a document the user supplied: "Claude System or Mobile Project Document for Optimizing Usage and Limit" — a token-efficiency-oriented planning convention (concise docs, reference by file/section rather than re-pasting content, update docs as the project evolves rather than accumulating stale info).
