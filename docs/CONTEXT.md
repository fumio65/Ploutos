# CONTEXT.md — Ploutos

## Project Status
Phase: **0 — Planning & Foundation** (see TASKS.md for the active sprint and task IDs). Feature set and schema design in progress. No code written yet. Conversion to native app (via Capacitor) is a planned future phase, not current work.

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
- **Goals data model — resolved 2026-10-08 (T001).** Confirmed as transfer-funded sub-accounts; see ARCHITECTURE.md "Goals" and DECISIONS.md. No longer a blocker — T002 (schema) is next up.
- No repo/codebase exists yet — this is pre-code planning. No git branches created; see TASKS.md for the branch naming convention (`feature/t<id>-<slug>`) once work starts.

## Source Material
This planning structure (PRD/ARCHITECTURE/CONTEXT/TASKS split) follows a document the user supplied: "Claude System or Mobile Project Document for Optimizing Usage and Limit" — a token-efficiency-oriented planning convention (concise docs, reference by file/section rather than re-pasting content, update docs as the project evolves rather than accumulating stale info).
