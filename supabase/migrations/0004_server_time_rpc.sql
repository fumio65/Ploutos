-- Exposes Postgres' own clock to clients via RPC, so the app can measure
-- and correct for client/server clock drift before comparing timestamps
-- for last-write-wins conflict resolution (see src/lib/sync.ts syncClockOffset()).
create or replace function public.server_time()
returns timestamptz
language sql
stable
security invoker
set search_path = public
as $$
  select now();
$$;

grant execute on function public.server_time() to authenticated, anon;
