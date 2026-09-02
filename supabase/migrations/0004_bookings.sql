-- ============================================================================
-- 0004_bookings.sql
-- The core transaction. Replaces booking fields on the `socialCircleUser`
-- localStorage blob, which vanished when a user switched devices.
-- ============================================================================

create table public.bookings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  venue_slug    text not null references public.venues,
  location_id   uuid references public.venue_locations,
  booking_date  date not null,
  booking_time  time not null,
  party_size    integer not null default 1 check (party_size between 1 and 20),
  status        text not null default 'confirmed'
                  check (status in ('confirmed', 'cancelled', 'completed')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One live booking per person per venue per slot. A partial unique index
-- (rather than a table constraint) so a cancelled booking does not block
-- re-booking the same slot.
create unique index bookings_one_per_slot
  on public.bookings (user_id, venue_slug, booking_date, booking_time)
  where status = 'confirmed';

create index bookings_user_idx  on public.bookings (user_id, booking_date desc);
create index bookings_slot_idx  on public.bookings (venue_slug, booking_date, booking_time)
  where status = 'confirmed';

create trigger bookings_touch_updated_at
  before update on public.bookings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.bookings enable row level security;

create policy "bookings: read own"
  on public.bookings for select
  using (auth.uid() = user_id);

create policy "bookings: cancel own"
  on public.bookings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "bookings: admin reads all"
  on public.bookings for select
  using (public.is_admin());

-- Deliberately NO insert policy for users.
-- Direct inserts are impossible; every booking must go through book_venue()
-- below, so capacity and age checks cannot be bypassed by calling the table
-- directly from the client SDK.

create policy "bookings: admin writes"
  on public.bookings for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- book_venue() — the only way to create a booking.
--
-- Concurrency: takes a row lock on the venue with SELECT ... FOR UPDATE
-- BEFORE counting existing bookings. This is the part that matters. The
-- naive version (count, then insert) double-books under load, and a booking
-- app's busiest second is exactly when that race fires. The lock serialises
-- all concurrent bookings for the same venue, so the count each caller sees
-- already includes every booking that will commit before it.
--
-- Call from the client as:
--   supabase.rpc('book_venue', { p_venue_slug: 'mulliri', ... })
-- ---------------------------------------------------------------------------
create or replace function public.book_venue(
  p_venue_slug   text,
  p_booking_date date,
  p_booking_time time,
  p_party_size   integer default 1,
  p_location_id  uuid default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venue    public.venues;
  v_profile  public.profiles;
  v_taken    integer;
  v_booking  public.bookings;
  v_user_id  uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'You must be signed in to book'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_profile from public.profiles where id = v_user_id;
  if not found then
    raise exception 'Profile not found';
  end if;

  if v_profile.is_suspended then
    raise exception 'This account is suspended'
      using errcode = 'insufficient_privilege';
  end if;

  if p_booking_date < current_date then
    raise exception 'Cannot book a date in the past';
  end if;

  -- Lock the venue row. Everything after this is serialised per venue.
  select * into v_venue
    from public.venues
   where slug = p_venue_slug and is_active
     for update;

  if not found then
    raise exception 'Venue not found or not accepting bookings';
  end if;

  -- Venue age limits, checked against the real date of birth rather than a
  -- self-reported bucket string.
  if public.age_years(v_profile.date_of_birth) not between v_venue.min_age and v_venue.max_age then
    raise exception 'This venue admits ages % to %', v_venue.min_age, v_venue.max_age
      using errcode = 'check_violation';
  end if;

  -- A supplied branch must belong to this venue.
  if p_location_id is not null then
    perform 1 from public.venue_locations
      where id = p_location_id and venue_slug = p_venue_slug and is_active;
    if not found then
      raise exception 'That location does not belong to this venue';
    end if;
  end if;

  -- Seats already taken in this slot. Sums party_size; counting rows would
  -- undercount every group booking.
  select coalesce(sum(party_size), 0) into v_taken
    from public.bookings
   where venue_slug   = p_venue_slug
     and booking_date = p_booking_date
     and booking_time = p_booking_time
     and status       = 'confirmed';

  if v_taken + p_party_size > v_venue.capacity then
    raise exception 'Only % of % seats left at % for that time',
      greatest(v_venue.capacity - v_taken, 0), v_venue.capacity, v_venue.name
      using errcode = 'check_violation';
  end if;

  insert into public.bookings
    (user_id, venue_slug, location_id, booking_date, booking_time, party_size)
  values
    (v_user_id, p_venue_slug, p_location_id, p_booking_date, p_booking_time, p_party_size)
  returning * into v_booking;

  return v_booking;
end;
$$;

revoke all on function public.book_venue(text, date, time, integer, uuid) from public;
grant execute on function public.book_venue(text, date, time, integer, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- venue_availability() — live occupancy, derived from real bookings.
-- Replaces the hardcoded `activeCount` / `liveAgeBreakdown` constants.
-- ---------------------------------------------------------------------------
create or replace function public.venue_availability(
  p_venue_slug   text,
  p_booking_date date
)
returns table (booking_time time, seats_taken integer, seats_left integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.booking_time,
    sum(b.party_size)::integer,
    (v.capacity - sum(b.party_size))::integer
  from public.bookings b
  join public.venues v on v.slug = b.venue_slug
  where b.venue_slug   = p_venue_slug
    and b.booking_date = p_booking_date
    and b.status       = 'confirmed'
  group by b.booking_time, v.capacity
  order by b.booking_time;
$$;

grant execute on function public.venue_availability(text, date) to anon, authenticated;
