import { db, SYNCABLE_TABLES, type SyncableTable } from './db'
import { supabase } from './supabase'

// ============================================================================
// Ploutos — Sync layer (T007)
//
// Pattern (see docs/ARCHITECTURE.md "Offline Sync Design"):
//   1. App code writes to Dexie first (local store is always the source of
//      truth for the UI) and calls queueChange() to mark the record dirty.
//   2. On reconnect, pushOutbox() drains the queue: each dirty record is
//      compared against its current remote row and only pushed if the local
//      copy is at least as new (last-write-wins by `updated_at`). If the
//      remote copy turns out to be newer (e.g. edited from another device
//      while this one was offline), the local row is overwritten with the
//      remote one instead of being clobbered.
//   3. pullTable() then fetches anything changed remotely since this table's
//      watermark (`sync_meta.last_synced_at`) and merges it down, again with
//      remote-wins-if-newer as the tie-breaker.
//   4. runSync() does push-then-pull for every syncable table, and is wired
//      to fire on the browser's `online` event and on app start.
// ============================================================================

type SyncableRecord = {
  id: string
  user_id: string
  updated_at: string
  deleted_at?: string
}

// ----------------------------------------------------------------------------
// Clock-offset correction
//
// Last-write-wins conflict resolution compares a timestamp stamped by this
// browser (`new Date()`) against one stamped by Postgres (the `updated_at`
// trigger, using the server's clock). That only works if the two clocks
// agree. A user's device clock can be wrong — intentionally (manual time,
// wrong timezone offset) or not — with no relation to how recently they
// actually edited something. Rather than assume client clocks are correct,
// we measure the gap against the server once per session and add it to
// every timestamp this app stamps locally, so "later" always means later
// in real time, not later on whichever clock happens to read higher.
// ----------------------------------------------------------------------------

let clockOffsetMs = 0

/**
 * Measures (server time) - (local time) via a round trip to Postgres' own
 * now(), and caches the result for nowIso() to use. Safe to call repeatedly
 * (e.g. at the start of every sync) — a failed attempt just leaves the
 * previous offset (or 0) in place rather than throwing.
 */
export async function syncClockOffset(): Promise<number> {
  try {
    const requestStart = Date.now()
    const { data, error } = await supabase.rpc('server_time')
    if (error || !data) return clockOffsetMs
    const requestEnd = Date.now()
    // Assume the request and response legs took about the same time, so the
    // server's `now()` corresponds to the midpoint of the round trip.
    const roundTripMidpoint = requestStart + (requestEnd - requestStart) / 2
    const serverMs = new Date(data).getTime()
    clockOffsetMs = serverMs - roundTripMidpoint
    return clockOffsetMs
  } catch {
    return clockOffsetMs
  }
}

/** Current time, corrected by the measured server/client clock offset. */
export function nowIso(): string {
  return new Date(Date.now() + clockOffsetMs).toISOString()
}

/** Call after any local write to a syncable table, to queue it for push. */
export async function queueChange(table: SyncableTable, recordId: string) {
  await db.outbox.add({
    table_name: table,
    record_id: recordId,
    queued_at: nowIso(),
  })
}

/**
 * Active connectivity check. `navigator.onLine` alone is unreliable (it only
 * reflects whether the OS network interface is up, not whether Supabase is
 * actually reachable), so this does a real round trip: a cheap authenticated
 * HEAD-style request to the Supabase REST root, with a short timeout so a
 * dead connection fails fast instead of hanging the sync attempt.
 */
export async function isOnline(): Promise<boolean> {
  if (!navigator.onLine) return false

  try {
    const { error } = await supabase
      .from('categories')
      .select('id', { count: 'exact', head: true })
      .limit(1)
    return !error
  } catch {
    return false
  }
}

/**
 * Pushes every queued outbox entry. Entries for the same (table, record_id)
 * are deduped first — only the record's current local state is sent, not
 * every intermediate edit. For each record, fetches the remote row and only
 * upserts if local is at least as new; otherwise discards the push and pulls
 * the newer remote row down into Dexie instead (so the local copy is never
 * left stale after a losing push).
 */
export async function pushOutbox(): Promise<{ pushed: number; skipped: number }> {
  const entries = await db.outbox.toArray()
  if (entries.length === 0) return { pushed: 0, skipped: 0 }

  // Dedupe to the latest queued entry per (table, record_id).
  const latestByKey = new Map<string, (typeof entries)[number]>()
  for (const entry of entries) {
    latestByKey.set(`${entry.table_name}:${entry.record_id}`, entry)
  }

  let pushed = 0
  let skipped = 0

  for (const entry of latestByKey.values()) {
    const table = entry.table_name
    const local = (await (db[table] as any).get(entry.record_id)) as
      | SyncableRecord
      | undefined

    if (!local) {
      // Record was deleted locally before ever syncing — nothing to push.
      continue
    }

    const { data: remote, error: fetchError } = await supabase
      .from(table)
      .select('updated_at')
      .eq('id', local.id)
      .maybeSingle()

    if (fetchError) {
      // Network/auth problem — leave this entry queued and try again next sync.
      continue
    }

    const remoteIsNewer = remote && new Date(remote.updated_at) > new Date(local.updated_at)

    if (remoteIsNewer) {
      // Someone else's edit wins — pull it down instead of overwriting it.
      const { data: fullRemote } = await supabase
        .from(table)
        .select('*')
        .eq('id', local.id)
        .maybeSingle()
      if (fullRemote) {
        await (db[table] as any).put(fullRemote)
      }
      skipped++
    } else {
      const { error: upsertError } = await supabase.from(table).upsert(local)
      if (upsertError) {
        continue // leave queued, retry next sync
      }
      pushed++
    }

    // Remove every queued entry for this key, not just the latest one.
    await db.outbox.where({ table_name: table, record_id: entry.record_id }).delete()
  }

  return { pushed, skipped }
}

/**
 * Pulls rows changed remotely since this table's watermark, merges them into
 * Dexie (remote wins if newer, same rule as the push path), and advances the
 * watermark to the newest `updated_at` seen.
 */
export async function pullTable(table: SyncableTable): Promise<number> {
  const meta = await db.sync_meta.get(table)
  const since = meta?.last_synced_at ?? '1970-01-01T00:00:00.000Z'

  const { data: rows, error } = await supabase
    .from(table)
    .select('*')
    .gt('updated_at', since)
    .order('updated_at', { ascending: true })

  if (error || !rows || rows.length === 0) return 0

  let newestSeen = since

  for (const remote of rows as SyncableRecord[]) {
    const local = (await (db[table] as any).get(remote.id)) as SyncableRecord | undefined
    const remoteIsNewer = !local || new Date(remote.updated_at) >= new Date(local.updated_at)
    if (remoteIsNewer) {
      await (db[table] as any).put(remote)
    }
    if (new Date(remote.updated_at) > new Date(newestSeen)) {
      newestSeen = remote.updated_at
    }
  }

  await db.sync_meta.put({ table_name: table, last_synced_at: newestSeen })
  return rows.length
}

export interface SyncResult {
  ranAt: string
  online: boolean
  pushed: number
  skippedPushes: number
  pulled: number
}

/** Push every table's outbox, then pull every table. Safe to call repeatedly. */
export async function runSync(): Promise<SyncResult> {
  const online = await isOnline()
  if (!online) {
    return { ranAt: nowIso(), online: false, pushed: 0, skippedPushes: 0, pulled: 0 }
  }

  // Refresh the clock offset before resolving any conflicts this sync will
  // do, so `nowIso()` timestamps (on outbox entries queued since the last
  // sync) are compared on a level footing with the server's own clock.
  await syncClockOffset()

  const { pushed, skipped } = await pushOutbox()

  let pulled = 0
  for (const table of SYNCABLE_TABLES) {
    pulled += await pullTable(table)
  }

  return {
    ranAt: nowIso(),
    online: true,
    pushed,
    skippedPushes: skipped,
    pulled,
  }
}

// A sync already in flight is tracked here so an automatic trigger (the
// `online` event, or the one-shot startup attempt) can never run
// concurrently with a manual "Sync now" click or another automatic trigger.
// Without this, two overlapping runs could race: one reads a record before
// the other's write lands, then writes its own (stale) decision on top.
let syncInFlight: Promise<SyncResult> | null = null

/**
 * Same as runSync(), but if a sync is already running (triggered
 * automatically or from another click), returns that run's result instead
 * of starting a second, overlapping one. Use this everywhere a sync can be
 * user-triggered (buttons) as well as event-triggered.
 */
export function runSyncExclusive(): Promise<SyncResult> {
  if (syncInFlight) return syncInFlight
  const run = runSync().finally(() => {
    if (syncInFlight === run) syncInFlight = null
  })
  syncInFlight = run
  return run
}

/** Wires runSync() to fire on reconnect and once on startup. Call once from App. */
export function startSyncListeners(onResult?: (result: SyncResult) => void) {
  const trigger = () => {
    runSyncExclusive().then((result) => onResult?.(result))
  }

  window.addEventListener('online', trigger)
  trigger() // attempt once on startup, in case we're already online

  return () => window.removeEventListener('online', trigger)
}
