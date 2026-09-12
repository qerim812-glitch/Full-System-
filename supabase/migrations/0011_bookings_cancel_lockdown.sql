-- ============================================================================
-- 0011_bookings_cancel_lockdown.sql
--
-- "bookings: cancel own" (0004) is `using (auth.uid() = user_id) with check
-- (auth.uid() = user_id)` — that only proves the row is yours, it does not
-- constrain WHICH columns change or what the new status is. Since bookings
-- has no insert policy and the client SDK can call PostgREST directly with
-- the caller's own JWT, that policy alone let any signed-in user:
--   * flip their own booking straight to 'completed', which trivially
--     satisfies "reviews: write own after visiting" (0005) without ever
--     visiting — forged reviews.
--   * edit party_size / booking_date / booking_time / location_id on an
--     already-confirmed row after book_venue()'s capacity check ran —
--     silent overbooking past the venue's real capacity.
--
-- RLS policies see either the old row (USING) or the new row (WITH CHECK),
-- never both at once, so "only status may change, and only confirmed ->
-- cancelled" cannot be expressed as a policy. A BEFORE UPDATE trigger can
-- see both and is the right tool here.
--
-- complete_past_bookings() (0009) legitimately moves confirmed -> completed,
-- and it runs outside any user's request context (pg_cron has no JWT, so
-- auth.uid() and is_admin() are both null/false there). It is redefined
-- below to flag the one UPDATE it performs as trusted, via a
-- transaction-local setting the trigger checks first.
-- ============================================================================

create or replace function public.enforce_booking_cancel_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Set by complete_past_bookings() around its own UPDATE, and nowhere else.
  if coalesce(current_setting('app.bypass_booking_guard', true), '') = 'true' then
    return new;
  end if;

  -- "bookings: admin writes" (0004) already gates who reaches this as an
  -- admin edit; do not additionally restrict what an admin edit changes.
  if public.is_admin() then
    return new;
  end if;

  if old.status is distinct from 'confirmed' or new.status is distinct from 'cancelled' then
    raise exception 'You can only cancel a confirmed booking'
      using errcode = 'insufficient_privilege';
  end if;

  if new.user_id is distinct from old.user_id
     or new.venue_slug is distinct from old.venue_slug
     or new.location_id is distinct from old.location_id
     or new.booking_date is distinct from old.booking_date
     or new.booking_time is distinct from old.booking_time
     or new.party_size is distinct from old.party_size
  then
    raise exception 'A booking cannot be edited, only cancelled'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

comment on function public.enforce_booking_cancel_only is
  'Restricts what "bookings: cancel own" actually permits: a non-admin, '
  'non-system UPDATE may only move a confirmed booking to cancelled, with '
  'every other column unchanged. Bypassed for admin edits and for '
  'complete_past_bookings() via app.bypass_booking_guard.';

create trigger bookings_enforce_cancel_only
  before update on public.bookings
  for each row execute function public.enforce_booking_cancel_only();

-- ---------------------------------------------------------------------------
-- Redefine complete_past_bookings() to flag its own UPDATE as trusted.
-- is_local = true (the third argument to set_config) scopes the setting to
-- the current transaction, so it can never leak into another caller's work.
-- ---------------------------------------------------------------------------
create or replace function public.complete_past_bookings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  perform set_config('app.bypass_booking_guard', 'true', true);

  update public.bookings
     set status = 'completed'
   where status = 'confirmed'
     and ((booking_date + booking_time) at time zone 'Europe/Tirane') < now();

  get diagnostics affected = row_count;
  return affected;
end;
$$;
  