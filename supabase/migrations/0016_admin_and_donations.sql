-- ============================================================================
-- 0016_admin_and_donations.sql
-- Buy Me a Coffee donations + the admin dashboard build-out.
-- Idempotent — safe to re-run. Run after 0015.
--
--   1. donations: provider / donor_name, so a Buy Me a Coffee supporter is
--      distinguishable from a manually recorded bank transfer.
--   2. reports: target_kind / target_id, so a report filed on a specific chat
--      message or review records WHAT was reported, not just who.
--   3. Admin analytics RPCs. These aggregate across every member's rows, so
--      they are security definer and each one refuses a non-admin caller.
--   4. Admin member drill-down counters in one round trip.
--
-- Table-returning functions are dropped before being recreated: changing a
-- RETURNS TABLE signature in place fails with 42P13.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DONATIONS — where the money came from
-- ----------------------------------------------------------------------------
-- `method` keeps its existing CHECK ('bank_transfer','card','other'); a Buy Me
-- a Coffee donation is a card payment. `provider` is the new axis: which
-- system produced the row. provider_ref already exists and is UNIQUE, which is
-- what makes webhook delivery idempotent — a replayed BMC event collides on it
-- instead of double-counting.
alter table public.donations
  add column if not exists provider   text not null default 'manual'
    check (provider in ('manual','buymeacoffee')),
  add column if not exists donor_name text;

create index if not exists donations_provider_idx
  on public.donations (provider, created_at desc);

comment on column public.donations.provider is
  'manual = recorded by a member or admin and confirmed by hand; buymeacoffee = created by the BMC webhook.';

-- ----------------------------------------------------------------------------
-- 2. REPORTS — what exactly was reported
-- ----------------------------------------------------------------------------
-- reported_user_id and venue_slug say who/where. target_kind + target_id say
-- which piece of content, so the admin queue can link straight to it. Both
-- stay nullable: every report that already exists predates this.
alter table public.reports
  add column if not exists target_kind text
    check (target_kind in ('chat_message','direct_message','review','profile','venue')),
  add column if not exists target_id   uuid;

-- A content kind without an id would be a dead link in the admin queue.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reports_target_id_required' and conrelid = 'public.reports'::regclass
  ) then
    alter table public.reports add constraint reports_target_id_required check (
      target_kind is null
      or target_kind in ('profile','venue')
      or target_id is not null
    );
  end if;
end; $$;

create index if not exists reports_target_idx
  on public.reports (target_kind, target_id) where target_kind is not null;

-- ----------------------------------------------------------------------------
-- 3. ADMIN ANALYTICS
-- ----------------------------------------------------------------------------
-- Each of these reads across every member's rows, so it runs as definer and
-- must gate on is_admin() itself — definer bypasses RLS, so forgetting the
-- check here would expose the whole table to any authenticated caller.

drop function if exists public.admin_bookings_daily(integer);
create function public.admin_bookings_daily(days integer default 30)
returns table (day date, bookings integer, cancelled integer)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if days is null or days < 1 or days > 365 then
    raise exception 'days must be between 1 and 365';
  end if;

  return query
  -- Grouped by booking_date, not created_at: "bookings per day" is how busy
  -- each day was, which is what an operator reads it as. booking_date is a
  -- plain `date`, so this also sidesteps the timezone trap that bucketing a
  -- timestamptz would hit — a table booked at 00:30 in Tirana is 22:30 UTC the
  -- previous day, and the session timezone on Supabase is UTC.
  --
  -- generate_series so days with no bookings come back as zero rather than
  -- being missing; a line chart with holes in it misreads as a dip.
  select d::date,
         count(b.id) filter (where b.status <> 'cancelled')::integer,
         count(b.id) filter (where b.status =  'cancelled')::integer
  from generate_series(
         (now() at time zone 'Europe/Tirane')::date - (days - 1),
         (now() at time zone 'Europe/Tirane')::date,
         interval '1 day') d
  left join public.bookings b on b.booking_date = d::date
  group by d
  order by d;
end;
$$;
revoke execute on function public.admin_bookings_daily(integer) from public;
grant  execute on function public.admin_bookings_daily(integer) to authenticated;

drop function if exists public.admin_bookings_by_venue();
create function public.admin_bookings_by_venue()
returns table (venue_slug text, venue_name text, bookings integer, seats integer)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return query
  select v.slug, v.name,
         count(b.id)::integer,
         coalesce(sum(b.party_size), 0)::integer
  from public.venues v
  left join public.bookings b
    on b.venue_slug = v.slug and b.status <> 'cancelled'
  group by v.slug, v.name
  order by count(b.id) desc, v.name;
end;
$$;
revoke execute on function public.admin_bookings_by_venue() from public;
grant  execute on function public.admin_bookings_by_venue() to authenticated;

drop function if exists public.admin_members_weekly(integer);
create function public.admin_members_weekly(weeks integer default 12)
returns table (week_start date, joined integer)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if weeks is null or weeks < 1 or weeks > 104 then
    raise exception 'weeks must be between 1 and 104';
  end if;

  return query
  -- profiles.created_at is timestamptz. Truncating it without saying in which
  -- zone would bucket by UTC weeks while the rest of the app reads Tirana
  -- dates, so both sides of the join are converted to Europe/Tirane local time
  -- first and the comparison is timestamp-to-timestamp, never mixed.
  select w::date, count(p.id)::integer
  from generate_series(
         date_trunc('week', (now() at time zone 'Europe/Tirane'))
           - ((weeks - 1) * interval '1 week'),
         date_trunc('week', (now() at time zone 'Europe/Tirane')),
         interval '1 week') w
  left join public.profiles p
    on date_trunc('week', p.created_at at time zone 'Europe/Tirane') = w
  group by w
  order by w;
end;
$$;
revoke execute on function public.admin_members_weekly(integer) from public;
grant  execute on function public.admin_members_weekly(integer) to authenticated;

drop function if exists public.admin_donation_totals();
create function public.admin_donation_totals()
returns table (
  currency        text,
  confirmed_minor bigint,
  pending_minor   bigint,
  confirmed_count integer,
  pending_count   integer
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return query
  -- Grouped by currency on purpose: ALL and EUR minor units are not the same
  -- unit and must never be summed into one number.
  select d.currency,
         coalesce(sum(d.amount_minor) filter (where d.status = 'confirmed'), 0)::bigint,
         coalesce(sum(d.amount_minor) filter (where d.status = 'pending'),   0)::bigint,
         count(*) filter (where d.status = 'confirmed')::integer,
         count(*) filter (where d.status = 'pending')::integer
  from public.donations d
  group by d.currency
  order by d.currency;
end;
$$;
revoke execute on function public.admin_donation_totals() from public;
grant  execute on function public.admin_donation_totals() to authenticated;

-- ----------------------------------------------------------------------------
-- 4. ADMIN MEMBER DRILL-DOWN
-- ----------------------------------------------------------------------------
-- One round trip instead of six counts from the server function.
drop function if exists public.admin_member_stats(uuid);
create function public.admin_member_stats(member_id uuid)
returns table (
  bookings_total     integer,
  bookings_confirmed integer,
  bookings_cancelled integer,
  reviews_total      integer,
  reports_filed      integer,
  reports_received   integer,
  connections_total  integer,
  donations_confirmed_count integer
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return query
  select
    (select count(*)::integer from public.bookings where user_id = member_id),
    (select count(*)::integer from public.bookings where user_id = member_id and status = 'confirmed'),
    (select count(*)::integer from public.bookings where user_id = member_id and status = 'cancelled'),
    (select count(*)::integer from public.reviews  where user_id = member_id),
    (select count(*)::integer from public.reports  where reporter_id = member_id),
    (select count(*)::integer from public.reports  where reported_user_id = member_id),
    (select count(*)::integer from public.connections
       where (requester_id = member_id or addressee_id = member_id) and status = 'accepted'),
    (select count(*)::integer from public.donations where user_id = member_id and status = 'confirmed');
end;
$$;
revoke execute on function public.admin_member_stats(uuid) from public;
grant  execute on function public.admin_member_stats(uuid) to authenticated;
