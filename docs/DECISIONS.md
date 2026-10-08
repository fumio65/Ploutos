# DECISIONS.md — Key Technical Decisions

> Current build status / active sprint: see TASKS.md

| Decision | Rationale | Status |
|---|---|---|
| App name: **Ploutos** | Greek god of wealth; myth (Zeus blinding him for impartial distribution) maps directly onto the app's purpose — giving sight back to blind, scattered wealth | Confirmed |
| Theme: **Modern Minimal** (navy/emerald, Space Grotesk) | Chosen over Classical Gold and Warm Mediterranean after visual comparison of all three | Confirmed |
| Signature mark: **Cornucopia** (not coin+"P") | Ties directly to the Ploutos myth rather than generic fintech iconography; tested legible down to 28px; used as app icon and in the logo lockup | Confirmed |
| Web-first, Capacitor-wrapped later | Single codebase, iterate fast in browser before native packaging | Confirmed |
| React + Vite (not Next.js) | Capacitor needs a static bundle; Next's SSR model doesn't fit | Confirmed |
| Ionic React for UI components | Native-feeling components reused directly when wrapped in Capacitor | Confirmed |
| Tailwind CSS alongside Ionic | Custom layout/spacing; watch for `preflight` conflicts with Ionic base styles | Confirmed |
| Supabase (Postgres + Auth + RLS) | Relational structure fits financial data; built-in Google OAuth and RLS | Confirmed |
| Offline-first via Dexie.js (web) → SQLite (native) | UI never blocks on network; local store is source of truth | Confirmed |
| Last-write-wins conflict resolution | Simple, sufficient for single-user data; avoids CRDT complexity | Confirmed |
| Client-generated UUIDs | Records need stable IDs before they've ever synced | Confirmed |
| Soft deletes only | Sync needs to detect and propagate deletions | Confirmed |
| Debt/Receivables linked to ordinary transactions, no separate balance container | Simpler than a wallet-like model; debt reduces via normal expense/income entries | Confirmed |
| Goals as transfer-funded sub-accounts | Keeps wallet balance = true spendable money; prevents double-counting between "saved" and "spendable" money; matches the standard mental model of moving money into savings. Confirmed via worked example (₱50,000 Bank, ₱10,000 Trip goal transfer → Bank ₱40,000 / Trip ₱10,000, Net Worth unchanged) | **Confirmed (T001, 2026-10-08)** |
| Net Worth = accounts + goals + receivables − debts | Matches user's requested definition | Confirmed |
| Multi-currency without conversion | Avoids exchange-rate infrastructure in v1; currencies tracked independently | Confirmed |
| AI Q&A is online-only, tool-calling (not raw SQL generation) | Avoids local model complexity; avoids letting LLM generate arbitrary SQL against financial data | **Built (T019, 2026-10-09)** — `supabase/functions/ai-qa`, 4 fixed tool functions, LLM never writes SQL |
| LLM for AI Q&A: **Google Gemini** (free tier, Flash model), not Anthropic/OpenAI | User explicitly asked for a free option, given how little this feature is expected to be used; Gemini's Flash tier is genuinely free (not just trial credits) and supports native function/tool calling | **Confirmed (T019, 2026-10-09)** |
| Google sign-in needs a different flow on native (plugin-based) vs web (redirect-based) | WebView OAuth redirects are increasingly restricted by Google | **Branch point scaffolded (T018, 2026-10-08)** — `SignInPage` branches on `Capacitor.isNativePlatform()`; the native side is a documented stub (`src/lib/nativeAuth.ts`) that throws until a real plugin is chosen and Capacitor itself is set up. Not yet implemented. |
