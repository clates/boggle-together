-- Boggle Together: expire rooms idle for more than 6 hours.
-- participants, boards and words reference rooms with on delete cascade (0001),
-- so deleting a room removes all of its data.

create function public.cleanup_old_rooms() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_deleted int;
begin
  -- strictly older than 6 hours expires; exactly 6 hours is kept
  delete from public.rooms where last_activity_at < now() - interval '6 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.cleanup_old_rooms() from public, anon, authenticated;

-- Schedule every 15 minutes. If pg_cron cannot be enabled (hosted project:
-- enable it in Dashboard > Database > Extensions, then run
--   select cron.schedule('cleanup-old-rooms', '*/15 * * * *', 'select public.cleanup_old_rooms()');
-- ) the migration still applies.
do $$
begin
  create extension if not exists pg_cron;
  if exists (select 1 from cron.job where jobname = 'cleanup-old-rooms') then
    perform cron.unschedule('cleanup-old-rooms');
  end if;
  perform cron.schedule('cleanup-old-rooms', '*/15 * * * *', 'select public.cleanup_old_rooms()');
exception when others then
  raise notice 'pg_cron not scheduled (%); enable pg_cron and schedule manually', sqlerrm;
end;
$$;
