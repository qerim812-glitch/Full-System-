-- ============================================================================
-- 0013_complete.sql
-- NewPop — complete schema in one idempotent file.
--
-- USE THIS FILE to set up a fresh Supabase project instead of running the
-- numbered migrations 0001–0012.  It is also safe to run on a database that
-- already has some of those migrations applied (all DDL is idempotent).
--
-- BUGS FIXED vs the individual migration files:
--   • favorites:          user_id column was missing → added
--   • presence_checkins:  index WHERE used current_date (not IMMUTABLE) → removed
--   • blocked_user_ids(): existing function had a different return type →
--                         DROP IF EXISTS before CREATE to avoid 42P13 error
--   • All table-returning RPCs: same treatment
--   • 0010 / 0012:        were empty in the repo → now fully included here
-- ============================================================================

-- ============================================================================
-- EXTENSIONS
-- ============================================================================
create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ============================================================================
-- FOUNDATION HELPERS
-- ============================================================================

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

create or replace function public.age_years(dob date)
returns integer
language sql stable set search_path = ''
as $$
  select extract(year from age(current_date, dob))::integer;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ============================================================================
-- PROFILES
-- ============================================================================
create table if not exists public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  email         citext not null,
  display_name  text,
  date_of_birth date not null,
  avatar_url    text,
  is_suspended  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (email);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'profiles_touch_updated_at'
    and tgrelid = 'public.profiles'::regclass) then
    create trigger profiles_touch_updated_at
      before update on public.profiles
      for each row execute function public.touch_updated_at();
  end if;
end; $$;

create or replace function public.enforce_minimum_age()
returns trigger language plpgsql set search_path = ''
as $$
declare min_age constant integer := 18;
begin
  if new.date_of_birth is null then
    raise exception 'Date of birth is required';
  end if;
  if new.date_of_birth > current_date then
    raise exception 'Date of birth cannot be in the future';
  end if;
  if public.age_years(new.date_of_birth) < min_age then
    raise exception 'You must be at least % years old to use NewPop', min_age
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'profiles_enforce_minimum_age'
    and tgrelid = 'public.profiles'::regclass) then
    create trigger profiles_enforce_minimum_age
      before insert or update of date_of_birth on public.profiles
      for each row execute function public.enforce_minimum_age();
  end if;
end; $$;

alter table public.profiles enable row level security;

drop policy if exists "profiles: read own"          on public.profiles;
drop policy if exists "profiles: update own"        on public.profiles;
drop policy if exists "profiles: insert own"        on public.profiles;
drop policy if exists "profiles: admin reads all"   on public.profiles;
drop policy if exists "profiles: admin updates all" on public.profiles;

create policy "profiles: read own"        on public.profiles for select using (auth.uid() = id);
create policy "profiles: insert own"      on public.profiles for insert with check (auth.uid() = id);
create policy "profiles: update own"      on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles: admin reads all" on public.profiles for select using (public.is_admin());
create policy "profiles: admin updates all" on public.profiles for update using (public.is_admin());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, date_of_birth)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    (new.raw_user_meta_data ->> 'date_of_birth')::date
  );
  return new;
end;
$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_created'
    and tgrelid = 'auth.users'::regclass) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
end; $$;

-- ============================================================================
-- VENUES
-- ============================================================================
create table if not exists public.venues (
  slug          text primary key,
  name          text not null,
  description   text not null,
  image_url     text,
  location_url  text,
  min_age       integer not null check (min_age >= 18),
  max_age       integer not null,
  capacity      integer not null check (capacity > 0),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint venues_age_range_valid check (max_age >= min_age)
);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'venues_touch_updated_at'
    and tgrelid = 'public.venues'::regclass) then
    create trigger venues_touch_updated_at
      before update on public.venues
      for each row execute function public.touch_updated_at();
  end if;
end; $$;

create table if not exists public.venue_locations (
  id          uuid primary key default gen_random_uuid(),
  venue_slug  text not null references public.venues on delete cascade,
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (venue_slug, name)
);

create index if not exists venue_locations_venue_idx on public.venue_locations (venue_slug);

alter table public.venues          enable row level security;
alter table public.venue_locations enable row level security;

drop policy if exists "venues: public read active"          on public.venues;
drop policy if exists "venues: admin writes"                on public.venues;
drop policy if exists "venue_locations: public read active" on public.venue_locations;
drop policy if exists "venue_locations: admin writes"       on public.venue_locations;

create policy "venues: public read active"          on public.venues for select using (is_active or public.is_admin());
create policy "venues: admin writes"                on public.venues for all   using (public.is_admin()) with check (public.is_admin());
create policy "venue_locations: public read active" on public.venue_locations for select using (is_active or public.is_admin());
create policy "venue_locations: admin writes"       on public.venue_locations for all   using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- BOOKINGS
-- ============================================================================
create table if not exists public.bookings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  venue_slug    text not null references public.venues,
  location_id   uuid references public.venue_locations,
  booking_date  date not null,
  booking_time  time not null,
  party_size    integer not null default 1 check (party_size between 1 and 20),
  status        text not null default 'confirmed'
                  check (status in ('confirmed','cancelled','completed')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists bookings_one_per_slot
  on public.bookings (user_id, venue_slug, booking_date, booking_time)
  where status = 'confirmed';
create index if not exists bookings_user_idx on public.bookings (user_id, booking_date desc);
create index if not exists bookings_slot_idx on public.bookings (venue_slug, booking_date, booking_time)
  where status = 'confirmed';

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'bookings_touch_updated_at'
    and tgrelid = 'public.bookings'::regclass) then
    create trigger bookings_touch_updated_at
      before update on public.bookings
      for each row execute function public.touch_updated_at();
  end if;
end; $$;

alter table public.bookings enable row level security;

drop policy if exists "bookings: read own"        on public.bookings;
drop policy if exists "bookings: cancel own"      on public.bookings;
drop policy if exists "bookings: admin reads all" on public.bookings;
drop policy if exists "bookings: admin writes"    on public.bookings;

create policy "bookings: read own"        on public.bookings for select using (auth.uid() = user_id);
create policy "bookings: cancel own"      on public.bookings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "bookings: admin reads all" on public.bookings for select using (public.is_admin());
create policy "bookings: admin writes"    on public.bookings for all   using (public.is_admin()) with check (public.is_admin());

-- book_venue() — the only valid way to create a booking
create or replace function public.book_venue(
  p_venue_slug   text,
  p_booking_date date,
  p_booking_time time,
  p_party_size   integer default 1,
  p_location_id  uuid    default null
)
returns public.bookings
language plpgsql security definer set search_path = ''
as $$
declare
  v_venue    public.venues;
  v_profile  public.profiles;
  v_taken    integer;
  v_booking  public.bookings;
  v_user_id  uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'You must be signed in to book' using errcode = 'insufficient_privilege';
  end if;
  select * into v_profile from public.profiles where id = v_user_id;
  if not found then raise exception 'Profile not found'; end if;
  if v_profile.is_suspended then
    raise exception 'This account is suspended' using errcode = 'insufficient_privilege';
  end if;
  if p_booking_date < current_date then
    raise exception 'Cannot book a date in the past';
  end if;
  select * into v_venue from public.venues where slug = p_venue_slug and is_active for update;
  if not found then raise exception 'Venue not found or not accepting bookings'; end if;
  if public.age_years(v_profile.date_of_birth) not between v_venue.min_age and v_venue.max_age then
    raise exception 'This venue admits ages % to %', v_venue.min_age, v_venue.max_age
      using errcode = 'check_violation';
  end if;
  if p_location_id is not null then
    perform 1 from public.venue_locations
      where id = p_location_id and venue_slug = p_venue_slug and is_active;
    if not found then raise exception 'That location does not belong to this venue'; end if;
  end if;
  select coalesce(sum(party_size), 0) into v_taken
    from public.bookings
   where venue_slug = p_venue_slug and booking_date = p_booking_date
     and booking_time = p_booking_time and status = 'confirmed';
  if v_taken + p_party_size > v_venue.capacity then
    raise exception 'Only % of % seats left at % for that time',
      greatest(v_venue.capacity - v_taken, 0), v_venue.capacity, v_venue.name
      using errcode = 'check_violation';
  end if;
  insert into public.bookings (user_id, venue_slug, location_id, booking_date, booking_time, party_size)
  values (v_user_id, p_venue_slug, p_location_id, p_booking_date, p_booking_time, p_party_size)
  returning * into v_booking;
  return v_booking;
end;
$$;

revoke all    on function public.book_venue(text, date, time, integer, uuid) from public;
grant  execute on function public.book_venue(text, date, time, integer, uuid) to authenticated;

-- venue_availability(): DROP first — returns TABLE, CREATE OR REPLACE can conflict
drop function if exists public.venue_availability(text, date);
create function public.venue_availability(p_venue_slug text, p_booking_date date)
returns table (booking_time time, seats_taken integer, seats_left integer)
language sql stable security definer set search_path = ''
as $$
  select
    b.booking_time,
    sum(b.party_size)::integer,
    (v.capacity - sum(b.party_size))::integer
  from public.bookings b
  join public.venues v on v.slug = b.venue_slug
  where b.venue_slug = p_venue_slug and b.booking_date = p_booking_date
    and b.status = 'confirmed'
  group by b.booking_time, v.capacity
  order by b.booking_time;
$$;

grant execute on function public.venue_availability(text, date) to anon, authenticated;

-- ============================================================================
-- BOOKING CANCEL LOCKDOWN
-- ============================================================================
create or replace function public.enforce_booking_cancel_only()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if coalesce(current_setting('app.bypass_booking_guard', true), '') = 'true' then return new; end if;
  if public.is_admin() then return new; end if;
  if old.status is distinct from 'confirmed' or new.status is distinct from 'cancelled' then
    raise exception 'You can only cancel a confirmed booking' using errcode = 'insufficient_privilege';
  end if;
  if new.user_id is distinct from old.user_id or new.venue_slug is distinct from old.venue_slug
  or new.location_id is distinct from old.location_id or new.booking_date is distinct from old.booking_date
  or new.booking_time is distinct from old.booking_time or new.party_size is distinct from old.party_size
  then
    raise exception 'A booking cannot be edited, only cancelled' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'bookings_enforce_cancel_only'
    and tgrelid = 'public.bookings'::regclass) then
    create trigger bookings_enforce_cancel_only
      before update on public.bookings
      for each row execute function public.enforce_booking_cancel_only();
  end if;
end; $$;

create or replace function public.complete_past_bookings()
returns integer language plpgsql security definer set search_path = public
as $$
declare affected integer;
begin
  perform set_config('app.bypass_booking_guard', 'true', true);
  update public.bookings set status = 'completed'
   where status = 'confirmed'
     and ((booking_date + booking_time) at time zone 'Europe/Tirane') < now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke execute on function public.complete_past_bookings() from public, anon, authenticated;

do $sched$
begin
  create extension if not exists pg_cron;
  if exists (select 1 from cron.job where jobname = 'complete-past-bookings') then
    perform cron.unschedule('complete-past-bookings');
  end if;
  perform cron.schedule('complete-past-bookings', '*/15 * * * *',
    'select public.complete_past_bookings()');
  raise notice 'Scheduled complete-past-bookings every 15 minutes.';
exception when others then
  raise warning 'pg_cron not available (%): enable it in Dashboard → Extensions.', sqlerrm;
end;
$sched$;

-- ============================================================================
-- FAVOURITES & REVIEWS
-- ============================================================================

-- BUG FIX: original 0005 was missing user_id column
create table if not exists public.favorites (
  user_id     uuid not null references auth.users on delete cascade,
  venue_slug  text not null references public.venues on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, venue_slug)
);

alter table public.favorites enable row level security;

drop policy if exists "favorites: manage own" on public.favorites;
create policy "favorites: manage own" on public.favorites for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  venue_slug  text not null references public.venues on delete cascade,
  rating      integer not null check (rating between 1 and 5),
  comment     text check (char_length(comment) <= 2000),
  is_hidden   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, venue_slug)
);

create index if not exists reviews_venue_idx on public.reviews (venue_slug, created_at desc)
  where is_hidden = false;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'reviews_touch_updated_at'
    and tgrelid = 'public.reviews'::regclass) then
    create trigger reviews_touch_updated_at
      before update on public.reviews
      for each row execute function public.touch_updated_at();
  end if;
end; $$;

alter table public.reviews enable row level security;

drop policy if exists "reviews: public read visible"      on public.reviews;
drop policy if exists "reviews: write own after visiting" on public.reviews;
drop policy if exists "reviews: update own"               on public.reviews;
drop policy if exists "reviews: delete own"               on public.reviews;
drop policy if exists "reviews: admin moderates"          on public.reviews;

create policy "reviews: public read visible"
  on public.reviews for select
  using (is_hidden = false or auth.uid() = user_id or public.is_admin());
create policy "reviews: write own after visiting"
  on public.reviews for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.bookings b
      where b.user_id = auth.uid() and b.venue_slug = reviews.venue_slug and b.status = 'completed')
  );
create policy "reviews: update own" on public.reviews for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reviews: delete own" on public.reviews for delete using (auth.uid() = user_id);
create policy "reviews: admin moderates" on public.reviews for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- BLOCKING
-- ============================================================================
create table if not exists public.blocks (
  blocker_id  uuid not null references auth.users on delete cascade,
  blocked_id  uuid not null references auth.users on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_no_self check (blocker_id <> blocked_id)
);

alter table public.blocks enable row level security;

drop policy if exists "blocks: manage own" on public.blocks;
create policy "blocks: manage own" on public.blocks for all
  using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
     where (blocker_id = a and blocked_id = b)
        or (blocker_id = b and blocked_id = a)
  );
$$;

-- ============================================================================
-- CHAT MESSAGES
-- ============================================================================
create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  venue_slug  text not null references public.venues on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  body        text not null check (char_length(body) between 1 and 1000),
  is_hidden   boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists chat_messages_room_idx
  on public.chat_messages (venue_slug, created_at desc) where is_hidden = false;

alter table public.chat_messages enable row level security;

drop policy if exists "chat: read as member"   on public.chat_messages;
drop policy if exists "chat: post as attendee" on public.chat_messages;
drop policy if exists "chat: delete own"       on public.chat_messages;
drop policy if exists "chat: admin moderates"  on public.chat_messages;

create policy "chat: read as member" on public.chat_messages for select
  using (auth.uid() is not null and is_hidden = false
    and not public.is_blocked_between(auth.uid(), user_id));
create policy "chat: post as attendee" on public.chat_messages for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_suspended = false)
    and exists (select 1 from public.bookings b where b.user_id = auth.uid()
      and b.venue_slug = chat_messages.venue_slug and b.status in ('confirmed','completed'))
  );
create policy "chat: delete own"      on public.chat_messages for delete using (auth.uid() = user_id);
create policy "chat: admin moderates" on public.chat_messages for all   using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- DIRECT MESSAGES
-- ============================================================================
create table if not exists public.direct_messages (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid not null references auth.users on delete cascade,
  recipient_id  uuid not null references auth.users on delete cascade,
  body          text not null check (char_length(body) between 1 and 2000),
  read_at       timestamptz,
  created_at    timestamptz not null default now(),
  constraint dm_no_self check (sender_id <> recipient_id)
);

create index if not exists dm_thread_idx on public.direct_messages (sender_id, recipient_id, created_at desc);
create index if not exists dm_inbox_idx  on public.direct_messages (recipient_id, created_at desc) where read_at is null;

alter table public.direct_messages enable row level security;

drop policy if exists "dm: read own threads"           on public.direct_messages;
drop policy if exists "dm: send unless blocked"        on public.direct_messages;
drop policy if exists "dm: mark read as recipient"     on public.direct_messages;
drop policy if exists "dm: admin reads for moderation" on public.direct_messages;

create policy "dm: read own threads"  on public.direct_messages for select using (auth.uid() in (sender_id, recipient_id));
create policy "dm: send unless blocked" on public.direct_messages for insert
  with check (
    auth.uid() = sender_id
    and not public.is_blocked_between(sender_id, recipient_id)
    and exists (select 1 from public.profiles p where p.id = auth.uid()    and p.is_suspended = false)
    and exists (select 1 from public.profiles p where p.id = recipient_id  and p.is_suspended = false)
  );
create policy "dm: mark read as recipient" on public.direct_messages for update
  using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);
create policy "dm: admin reads for moderation" on public.direct_messages for select using (public.is_admin());

-- ============================================================================
-- MODERATION — REPORTS & AUDIT LOG
-- ============================================================================
create table if not exists public.reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid not null references auth.users on delete cascade,
  reported_user_id  uuid references auth.users on delete set null,
  venue_slug        text references public.venues on delete set null,
  reason            text not null check (reason in (
                      'inappropriate_behavior','spam','harassment',
                      'fake_profile','safety_concern','other')),
  description       text check (char_length(description) <= 4000),
  status            text not null default 'open'
                      check (status in ('open','reviewing','actioned','dismissed')),
  resolved_by       uuid references auth.users on delete set null,
  resolved_at       timestamptz,
  resolution_note   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint reports_has_subject check (reported_user_id is not null or venue_slug is not null)
);

create index if not exists reports_queue_idx on public.reports (status, created_at)
  where status in ('open','reviewing');

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'reports_touch_updated_at'
    and tgrelid = 'public.reports'::regclass) then
    create trigger reports_touch_updated_at
      before update on public.reports for each row execute function public.touch_updated_at();
  end if;
end; $$;

alter table public.reports enable row level security;

drop policy if exists "reports: read own"       on public.reports;
drop policy if exists "reports: file own"       on public.reports;
drop policy if exists "reports: admin reads all" on public.reports;
drop policy if exists "reports: admin resolves" on public.reports;

create policy "reports: read own"       on public.reports for select using (auth.uid() = reporter_id);
create policy "reports: file own"       on public.reports for insert
  with check (auth.uid() = reporter_id and (reported_user_id is null or reported_user_id <> auth.uid()));
create policy "reports: admin reads all" on public.reports for select using (public.is_admin());
create policy "reports: admin resolves"  on public.reports for update using (public.is_admin()) with check (public.is_admin());

create table if not exists public.audit_log (
  id          bigserial primary key,
  actor_id    uuid references auth.users on delete set null,
  action      text not null,
  target_type text,
  target_id   text,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists audit_log_actor_idx  on public.audit_log (actor_id, created_at desc);
create index if not exists audit_log_target_idx on public.audit_log (target_type, target_id);

alter table public.audit_log enable row level security;

drop policy if exists "audit: read own actions" on public.audit_log;
drop policy if exists "audit: admin reads all"  on public.audit_log;
drop policy if exists "audit: append own"       on public.audit_log;

create policy "audit: read own actions" on public.audit_log for select using (auth.uid() = actor_id);
create policy "audit: admin reads all"  on public.audit_log for select using (public.is_admin());
create policy "audit: append own"       on public.audit_log for insert with check (auth.uid() = actor_id);

-- ============================================================================
-- DONATIONS
-- ============================================================================
create table if not exists public.donations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users on delete set null,
  donor_email   citext,
  amount_minor  bigint not null check (amount_minor > 0),
  currency      text not null default 'ALL' check (char_length(currency) = 3),
  method        text not null default 'bank_transfer'
                  check (method in ('bank_transfer','card','other')),
  status        text not null default 'pending'
                  check (status in ('pending','confirmed','failed','refunded')),
  provider_ref  text,
  message       text check (char_length(message) <= 1000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint donations_provider_ref_unique unique (provider_ref)
);

create index if not exists donations_user_idx   on public.donations (user_id, created_at desc);
create index if not exists donations_status_idx on public.donations (status,  created_at desc);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'donations_touch_updated_at'
    and tgrelid = 'public.donations'::regclass) then
    create trigger donations_touch_updated_at
      before update on public.donations for each row execute function public.touch_updated_at();
  end if;
end; $$;

alter table public.donations enable row level security;

drop policy if exists "donations: read own"      on public.donations;
drop policy if exists "donations: declare own"   on public.donations;
drop policy if exists "donations: admin manages" on public.donations;

create policy "donations: read own"      on public.donations for select using (auth.uid() = user_id);
create policy "donations: declare own"   on public.donations for insert with check (auth.uid() = user_id and status = 'pending');
create policy "donations: admin manages" on public.donations for all   using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- PROFILE VISIBILITY VIEW
-- ============================================================================
create or replace view public.public_profiles
with (security_invoker = true)
as
  select id, display_name, avatar_url
  from public.profiles
  where is_suspended = false;

grant select on public.public_profiles to authenticated;

-- blocked_user_ids(): DROP first — return type may differ from existing function
drop function if exists public.blocked_user_ids();
create function public.blocked_user_ids()
returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(distinct other_id), '{}')
  from (
    select blocked_id as other_id from public.blocks where blocker_id = auth.uid()
    union all
    select blocker_id as other_id from public.blocks where blocked_id  = auth.uid()
  ) t;
$$;

revoke execute on function public.blocked_user_ids() from public;
grant  execute on function public.blocked_user_ids() to authenticated;

-- ============================================================================
-- SOCIAL GRAPH — CONNECTIONS
-- ============================================================================
create table if not exists public.connections (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references auth.users on delete cascade,
  addressee_id  uuid not null references auth.users on delete cascade,
  status        text not null default 'pending'
                  check (status in ('pending','accepted','declined')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint connections_no_self     check (requester_id <> addressee_id),
  constraint connections_unique_pair unique  (requester_id, addressee_id)
);

create index if not exists connections_addressee_idx on public.connections (addressee_id, status);
create index if not exists connections_requester_idx on public.connections (requester_id, status);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'connections_touch_updated_at'
    and tgrelid = 'public.connections'::regclass) then
    create trigger connections_touch_updated_at
      before update on public.connections for each row execute function public.touch_updated_at();
  end if;
end; $$;

alter table public.connections enable row level security;

drop policy if exists "connections: read own"           on public.connections;
drop policy if exists "connections: request"            on public.connections;
drop policy if exists "connections: respond"            on public.connections;
drop policy if exists "connections: withdraw or remove" on public.connections;

create policy "connections: read own" on public.connections for select
  using (auth.uid() in (requester_id, addressee_id));
create policy "connections: request"  on public.connections for insert
  with check (
    auth.uid() = requester_id
    and not public.is_blocked_between(requester_id, addressee_id)
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_suspended = false)
  );
create policy "connections: respond" on public.connections for update
  using (auth.uid() = addressee_id) with check (auth.uid() = addressee_id);
create policy "connections: withdraw or remove" on public.connections for delete
  using (auth.uid() in (requester_id, addressee_id));

-- ============================================================================
-- PRESENCE CHECK-INS
-- ============================================================================
create table if not exists public.presence_checkins (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  venue_slug    text not null references public.venues on delete cascade,
  checkin_date  date not null,
  note          text check (char_length(note) <= 280),
  created_at    timestamptz not null default now(),
  unique (user_id, venue_slug, checkin_date)
);

-- BUG FIX: no WHERE predicate (current_date is not IMMUTABLE)
create index if not exists presence_venue_date_idx on public.presence_checkins (venue_slug, checkin_date);
create index if not exists presence_user_idx       on public.presence_checkins (user_id, checkin_date);

alter table public.presence_checkins enable row level security;

drop policy if exists "presence: read own"         on public.presence_checkins;
drop policy if exists "presence: read connections" on public.presence_checkins;
drop policy if exists "presence: manage own"       on public.presence_checkins;
drop policy if exists "presence: update own"       on public.presence_checkins;
drop policy if exists "presence: delete own"       on public.presence_checkins;

create policy "presence: read own" on public.presence_checkins for select using (auth.uid() = user_id);
create policy "presence: read connections" on public.presence_checkins for select
  using (
    auth.uid() is not null
    and not public.is_blocked_between(auth.uid(), user_id)
    and exists (
      select 1 from public.connections c where c.status = 'accepted'
        and ((c.requester_id = auth.uid() and c.addressee_id = user_id)
          or (c.requester_id = user_id    and c.addressee_id = auth.uid()))
    )
  );
create policy "presence: manage own" on public.presence_checkins for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_suspended = false)
  );
create policy "presence: update own" on public.presence_checkins for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "presence: delete own" on public.presence_checkins for delete using (auth.uid() = user_id);

-- ============================================================================
-- SOCIAL RPCs  (all DROP first — they return TABLE/SETOF which can't be
--               changed by CREATE OR REPLACE without matching signatures)
-- ============================================================================

drop function if exists public.my_connections();
create function public.my_connections()
returns table (connection_id uuid, user_id uuid, display_name text, avatar_url text, connected_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select
    c.id          as connection_id,
    p.id          as user_id,
    p.display_name,
    p.avatar_url,
    c.updated_at  as connected_at
  from public.connections c
  join public.profiles p on p.id = case
    when c.requester_id = auth.uid() then c.addressee_id else c.requester_id end
  where c.status = 'accepted' and auth.uid() in (c.requester_id, c.addressee_id)
    and p.is_suspended = false
  order by p.display_name;
$$;
revoke execute on function public.my_connections() from public;
grant  execute on function public.my_connections() to authenticated;

drop function if exists public.pending_connection_requests();
create function public.pending_connection_requests()
returns table (connection_id uuid, requester_id uuid, display_name text, avatar_url text, requested_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.requester_id, p.display_name, p.avatar_url, c.created_at
  from public.connections c
  join public.profiles p on p.id = c.requester_id
  where c.addressee_id = auth.uid() and c.status = 'pending' and p.is_suspended = false
  order by c.created_at desc;
$$;
revoke execute on function public.pending_connection_requests() from public;
grant  execute on function public.pending_connection_requests() to authenticated;

drop function if exists public.mutual_connections(uuid);
create function public.mutual_connections(p_other_id uuid)
returns table (user_id uuid, display_name text, avatar_url text)
language sql stable security definer set search_path = ''
as $$
  with my_ids as (
    select case when requester_id = auth.uid() then addressee_id else requester_id end as uid
    from public.connections where status = 'accepted' and auth.uid() in (requester_id, addressee_id)
  ),
  their_ids as (
    select case when requester_id = p_other_id then addressee_id else requester_id end as uid
    from public.connections where status = 'accepted' and p_other_id in (requester_id, addressee_id)
  )
  select p.id, p.display_name, p.avatar_url
  from my_ids m join their_ids t on t.uid = m.uid
  join public.profiles p on p.id = m.uid
  where p.is_suspended = false order by p.display_name;
$$;
revoke execute on function public.mutual_connections(uuid) from public;
grant  execute on function public.mutual_connections(uuid) to authenticated;

drop function if exists public.venue_social_feed(text, date);
create function public.venue_social_feed(p_venue_slug text, p_date date default current_date)
returns table (user_id uuid, display_name text, avatar_url text, note text, checkin_date date)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.display_name, p.avatar_url, pc.note, pc.checkin_date
  from public.presence_checkins pc
  join public.profiles p on p.id = pc.user_id
  join public.connections c on c.status = 'accepted'
    and ((c.requester_id = auth.uid() and c.addressee_id = pc.user_id)
      or (c.requester_id = pc.user_id and c.addressee_id = auth.uid()))
  where pc.venue_slug = p_venue_slug and pc.checkin_date = p_date
    and p.is_suspended = false
    and not public.is_blocked_between(auth.uid(), pc.user_id)
  order by p.display_name;
$$;
revoke execute on function public.venue_social_feed(text, date) from public;
grant  execute on function public.venue_social_feed(text, date) to authenticated;

-- ============================================================================
-- PROFILE REPAIR UTILITY
-- ============================================================================
create or replace function public.fix_missing_profile()
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid    := auth.uid();
  v_email   text;
  v_name    text;
  v_dob     date;
  v_count   integer;
begin
  if v_user_id is null then raise exception 'You must be signed in'; end if;
  select count(*) into v_count from public.profiles where id = v_user_id;
  if v_count > 0 then return 'ok:already_exists'; end if;
  select u.email::text,
         nullif(u.raw_user_meta_data ->> 'display_name', ''),
         (u.raw_user_meta_data ->> 'date_of_birth')::date
    into v_email, v_name, v_dob
    from auth.users u where u.id = v_user_id;
  if v_dob is null then v_dob := (current_date - interval '18 years')::date; end if;
  insert into public.profiles (id, email, display_name, date_of_birth)
  values (v_user_id, v_email::citext, v_name, v_dob);
  return 'ok:created';
end;
$$;

revoke execute on function public.fix_missing_profile() from public;
grant  execute on function public.fix_missing_profile() to authenticated;

comment on function public.fix_missing_profile is
  'Creates a profile row for the signed-in user when handle_new_user() did '
  'not fire (accounts created before migrations ran). Idempotent.';
