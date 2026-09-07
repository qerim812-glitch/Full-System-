-- ============================================================================
-- 0009_booking_completion.sql
--
-- Nothing ever moved a booking to 'completed'. book_venue() inserts
-- 'confirmed' and the app only ever writes 'cancelled', so the status was
-- reachable in the CHECK constraint but never in practice.
--
-- That silently made the "reviews: write own after visiting" policy in
-- 0005_engagement.sql impossible to satisfy: it requires a booking with
-- status = 'completed', so no user could ever write a review. This migration
-- is what unblocks reviews.
--
-- booking_date/booking_time are wall-clock Tirana values while now() is
-- timestamptz. The comparison is written with an explicit `at time zone` so
-- the cutoff does not drift by the UTC offset (1-2h for Tirana, depending on
-- daylight saving).
-- ============================================================================

create or replace function public.complete_past_bookings()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  affected integer;
begin
  update public.bookings
     set status = 'completed'
   where status = 'confirmed'
     and ((booking_date + booking_time) at time zone 'Europe/Tirane') < now();

  get diagnostics affected = row_count;
  return affected;
end;
$fn$;

comment on function public.complete_past_bookings is
  'Transitions confirmed bookings whose local (Europe/Tirane) start time has '
  'passed to completed. Scheduled every 15 minutes via pg_cron; also safe to '
  'call manually. Idempotent: a second run transitions nothing new.';

-- security definer means this runs with the owner's rights and bypasses RLS,
-- which it must in order to update other people's bookings. That is exactly
-- why no client role may call it. pg_cron runs as the table owner, so
-- revoking these does not stop the schedule below.
revoke execute on function public.complete_past_bookings() from public;
revoke execute on function public.complete_past_bookings() from anon;
revoke execute on function public.complete_past_bookings() from authenticated;

-- ---------------------------------------------------------------------------
-- Schedule it.
--
-- Wrapped so a project without pg_cron still gets the function installed and
-- a clear notice, rather than failing the migration partway through. Without
-- the schedule, bookings never complete and reviews stay blocked — so if you
-- see the notice below, enable pg_cron and re-run this file.
-- ---------------------------------------------------------------------------
do $sched$
begin
  create extension if not exists pg_cron;

  -- Idempotent re-registration, so re-running this file does not stack jobs.
  if exists (select 1 from cron.job where jobname = 'complete-past-bookings') then
    perform cron.unschedule('complete-past-bookings');
  end if;

  perform cron.schedule(
    'complete-past-bookings',
    '*/15 * * * *',
    'select public.complete_past_bookings()'
  );

  raise notice 'Scheduled complete-past-bookings every 15 minutes.';
exception
  when others then
    raise warning
      'Could not schedule complete_past_bookings(): %. Enable the pg_cron '
      'extension (Dashboard > Database > Extensions), then re-run this file. '
      'Until then bookings never reach completed and users cannot post '
      'reviews.', sqlerrm;
end;
$sched$;
