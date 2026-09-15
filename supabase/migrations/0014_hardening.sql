-- ============================================================================
-- 0014_hardening.sql
-- Follow-up to 0013_complete.sql. Idempotent — safe to re-run.
--
-- Fixes (see docs/AUDIT-2026-09-16.md for the reasoning behind each):
--   1. public_profiles returned only the caller's own row for non-admins
--      (security_invoker over a "read own" table) → People search, chat and
--      DM author names were empty for every normal member.
--   2. reviews → profiles had no FK, so PostgREST could not embed authors.
--   3. "profiles: update own" let a member un-suspend themselves or change
--      their date of birth → column guard trigger.
--   4. Column guards for connections / direct_messages / reviews updates,
--      audit_log inserts restricted to admins.
--   5. book_venue(): rejects same-day slots already in the past, adds notes
--      + confirmation code, honours per-branch capacity when set.
--   6. reschedule_booking(): atomic replacement for cancel-then-create.
--   7. Venue opening hours / slot length / address / phone / category /
--      price band; venue_rating_summary view.
--   8. avatars storage bucket + policies.
--   9. notifications table, triggers and unread_counts() for the header.
--  10. DB-enforced rate limits on chat, DMs, reports, connection requests.
--  11. Indexes flagged by the audit; cross-direction connection uniqueness.
--  12. fix_missing_profile() no longer invents a date of birth.
--  13. delete_my_account() (GDPR Art. 17).
-- ============================================================================

create extension if not exists pg_trgm;

-- ============================================================================
-- 1. PUBLIC PROFILES — owner-executed view with a fixed, PII-free column list
-- ============================================================================
drop view if exists public.public_profiles;
create view public.public_profiles
with (security_invoker = false)
as
  select id, display_name, avatar_url, created_at
  from public.profiles
  where is_suspended = false;

comment on view public.public_profiles is
  'Name + avatar of non-suspended members. Deliberately NOT security_invoker: '
  'profiles only allows "read own", so an invoker view showed each member '
  'nothing but themselves. Never add email or date_of_birth here.';

revoke all on public.public_profiles from public, anon;
grant select on public.public_profiles to authenticated;

-- ============================================================================
-- 2. FKs to profiles so PostgREST can embed authors
-- ============================================================================
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'reviews_user_profile_fkey') then
    alter table public.reviews
      add constraint reviews_user_profile_fkey
      foreign key (user_id) references public.profiles(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chat_messages_user_profile_fkey') then
    alter table public.chat_messages
      add constraint chat_messages_user_profile_fkey
      foreign key (user_id) references public.profiles(id) on delete cascade;
  end if;
exception when others then
  raise warning 'Could not add profile FKs (%). Orphan rows? Run: select user_id from reviews where user_id not in (select id from profiles);', sqlerrm;
end $$;

-- ============================================================================
-- 3. PROFILES — members may only change display_name and avatar_url
-- ============================================================================
create or replace function public.enforce_profile_update_columns()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if public.is_admin() then return new; end if;
  if new.id            is distinct from old.id
  or new.email         is distinct from old.email
  or new.date_of_birth is distinct from old.date_of_birth
  or new.is_suspended  is distinct from old.is_suspended
  or new.created_at    is distinct from old.created_at
  then
    raise exception 'Only your display name and avatar can be changed'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_update_columns on public.profiles;
create trigger profiles_enforce_update_columns
  before update on public.profiles
  for each row execute function public.enforce_profile_update_columns();

-- ============================================================================
-- 4. COLUMN GUARDS — connections, direct_messages, reviews; audit_log inserts
-- ============================================================================
create or replace function public.enforce_connection_update_columns()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if public.is_admin() then return new; end if;
  if new.requester_id is distinct from old.requester_id
  or new.addressee_id is distinct from old.addressee_id
  or new.created_at   is distinct from old.created_at
  then
    raise exception 'A connection request can only be accepted or declined'
      using errcode = 'insufficient_privilege';
  end if;
  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception 'This request has already been answered'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
drop trigger if exists connections_enforce_update_columns on public.connections;
create trigger connections_enforce_update_columns
  before update on public.connections
  for each row execute function public.enforce_connection_update_columns();

create or replace function public.enforce_dm_update_columns()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if public.is_admin() then return new; end if;
  if new.sender_id    is distinct from old.sender_id
  or new.recipient_id is distinct from old.recipient_id
  or new.body         is distinct from old.body
  or new.created_at   is distinct from old.created_at
  then
    raise exception 'Messages cannot be edited' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
drop trigger if exists direct_messages_enforce_update_columns on public.direct_messages;
create trigger direct_messages_enforce_update_columns
  before update on public.direct_messages
  for each row execute function public.enforce_dm_update_columns();

create or replace function public.enforce_review_update_columns()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if public.is_admin() then return new; end if;
  if new.user_id    is distinct from old.user_id
  or new.venue_slug is distinct from old.venue_slug
  or new.is_hidden  is distinct from old.is_hidden
  or new.created_at is distinct from old.created_at
  then
    raise exception 'Only the rating and comment of a review can be edited'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
drop trigger if exists reviews_enforce_update_columns on public.reviews;
create trigger reviews_enforce_update_columns
  before update on public.reviews
  for each row execute function public.enforce_review_update_columns();

drop policy if exists "audit: append own"   on public.audit_log;
drop policy if exists "audit: admin appends" on public.audit_log;
create policy "audit: admin appends" on public.audit_log for insert
  with check (auth.uid() = actor_id and public.is_admin());

-- ============================================================================
-- 5. VENUES — hours, slot length, address, phone, category, price band
-- ============================================================================
alter table public.venues
  add column if not exists opens_at     time    not null default '18:00',
  add column if not exists closes_at    time    not null default '23:00',
  add column if not exists slot_minutes integer not null default 60
    check (slot_minutes in (30, 60, 90, 120)),
  add column if not exists address      text,
  add column if not exists phone        text,
  add column if not exists category     text    not null default 'cafe'
    check (category in ('cafe','lounge','bar','restaurant','club','garden')),
  add column if not exists price_band   smallint not null default 2
    check (price_band between 1 and 4);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'venues_hours_valid') then
    alter table public.venues add constraint venues_hours_valid check (closes_at > opens_at);
  end if;
end $$;

-- Per-branch seating. NULL = fall back to the venue-wide capacity.
alter table public.venue_locations
  add column if not exists capacity integer check (capacity > 0),
  add column if not exists address  text;

-- Rating aggregate, reusable by list + detail pages.
create or replace view public.venue_rating_summary
with (security_invoker = true)
as
  select venue_slug,
         round(avg(rating)::numeric, 2) as average_rating,
         count(*)::integer              as review_count
  from public.reviews
  where is_hidden = false
  group by venue_slug;

grant select on public.venue_rating_summary to anon, authenticated;

-- ============================================================================
-- 6. BOOKINGS — notes, confirmation code, past-time check, branch capacity,
--    atomic reschedule
-- ============================================================================
alter table public.bookings
  add column if not exists notes text check (char_length(notes) <= 500),
  add column if not exists confirmation_code text not null
    default upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));

create index if not exists bookings_location_slot_idx
  on public.bookings (location_id, booking_date, booking_time)
  where status = 'confirmed';

-- The old 5-argument signature is dropped so PostgREST resolves one function.
drop function if exists public.book_venue(text, date, time, integer, uuid);
drop function if exists public.book_venue(text, date, time, integer, uuid, text);

create function public.book_venue(
  p_venue_slug   text,
  p_booking_date date,
  p_booking_time time,
  p_party_size   integer default 1,
  p_location_id  uuid    default null,
  p_notes        text    default null
)
returns public.bookings
language plpgsql security definer set search_path = ''
as $$
declare
  v_venue     public.venues;
  v_profile   public.profiles;
  v_location  public.venue_locations;
  v_taken     integer;
  v_capacity  integer;
  v_booking   public.bookings;
  v_user_id   uuid := auth.uid();
  v_now_local timestamp := (now() at time zone 'Europe/Tirane');
begin
  if v_user_id is null then
    raise exception 'You must be signed in to book' using errcode = 'insufficient_privilege';
  end if;
  select * into v_profile from public.profiles where id = v_user_id;
  if not found then raise exception 'Profile not found'; end if;
  if v_profile.is_suspended then
    raise exception 'This account is suspended' using errcode = 'insufficient_privilege';
  end if;
  if (p_booking_date + p_booking_time) < v_now_local then
    raise exception 'That time has already passed';
  end if;
  if p_booking_date > (v_now_local::date + 90) then
    raise exception 'Bookings open 90 days ahead';
  end if;

  select * into v_venue from public.venues where slug = p_venue_slug and is_active for update;
  if not found then raise exception 'Venue not found or not accepting bookings'; end if;

  if p_booking_time < v_venue.opens_at or p_booking_time >= v_venue.closes_at then
    raise exception '% is open from % to %', v_venue.name,
      to_char(v_venue.opens_at, 'HH24:MI'), to_char(v_venue.closes_at, 'HH24:MI');
  end if;

  if public.age_years(v_profile.date_of_birth) not between v_venue.min_age and v_venue.max_age then
    raise exception 'This venue admits ages % to %', v_venue.min_age, v_venue.max_age
      using errcode = 'check_violation';
  end if;

  v_capacity := v_venue.capacity;
  if p_location_id is not null then
    select * into v_location from public.venue_locations
      where id = p_location_id and venue_slug = p_venue_slug and is_active;
    if not found then raise exception 'That location does not belong to this venue'; end if;
    if v_location.capacity is not null then
      v_capacity := v_location.capacity;
      select coalesce(sum(party_size), 0) into v_taken
        from public.bookings
       where location_id = p_location_id and booking_date = p_booking_date
         and booking_time = p_booking_time and status = 'confirmed';
    end if;
  end if;
  if v_taken is null then
    select coalesce(sum(party_size), 0) into v_taken
      from public.bookings
     where venue_slug = p_venue_slug and booking_date = p_booking_date
       and booking_time = p_booking_time and status = 'confirmed';
  end if;

  if v_taken + p_party_size > v_capacity then
    raise exception 'Only % of % seats left at % for that time',
      greatest(v_capacity - v_taken, 0), v_capacity, v_venue.name
      using errcode = 'check_violation';
  end if;

  insert into public.bookings
    (user_id, venue_slug, location_id, booking_date, booking_time, party_size, notes)
  values
    (v_user_id, p_venue_slug, p_location_id, p_booking_date, p_booking_time, p_party_size,
     nullif(btrim(p_notes), ''))
  returning * into v_booking;
  return v_booking;
end;
$$;

revoke all    on function public.book_venue(text, date, time, integer, uuid, text) from public;
grant  execute on function public.book_venue(text, date, time, integer, uuid, text) to authenticated;

-- Atomic reschedule: the original row is kept (same id, same code) and only
-- moves if the new slot has room. Replaces cancel-then-create, which lost the
-- booking whenever the create step failed.
drop function if exists public.reschedule_booking(uuid, date, time);
create function public.reschedule_booking(
  p_booking_id   uuid,
  p_booking_date date,
  p_booking_time time
)
returns public.bookings
language plpgsql security definer set search_path = ''
as $$
declare
  v_booking   public.bookings;
  v_venue     public.venues;
  v_location  public.venue_locations;
  v_taken     integer;
  v_capacity  integer;
  v_user_id   uuid := auth.uid();
  v_now_local timestamp := (now() at time zone 'Europe/Tirane');
begin
  if v_user_id is null then
    raise exception 'You must be signed in' using errcode = 'insufficient_privilege';
  end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found or v_booking.user_id <> v_user_id then
    raise exception 'Booking not found';
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'Only a confirmed booking can be rescheduled';
  end if;
  if (p_booking_date + p_booking_time) < v_now_local then
    raise exception 'That time has already passed';
  end if;
  if p_booking_date = v_booking.booking_date and p_booking_time = v_booking.booking_time then
    return v_booking;
  end if;

  select * into v_venue from public.venues where slug = v_booking.venue_slug and is_active for update;
  if not found then raise exception 'Venue not found or not accepting bookings'; end if;
  if p_booking_time < v_venue.opens_at or p_booking_time >= v_venue.closes_at then
    raise exception '% is open from % to %', v_venue.name,
      to_char(v_venue.opens_at, 'HH24:MI'), to_char(v_venue.closes_at, 'HH24:MI');
  end if;

  v_capacity := v_venue.capacity;
  if v_booking.location_id is not null then
    select * into v_location from public.venue_locations where id = v_booking.location_id;
    if found and v_location.capacity is not null then
      v_capacity := v_location.capacity;
      select coalesce(sum(party_size), 0) into v_taken
        from public.bookings
       where location_id = v_booking.location_id and booking_date = p_booking_date
         and booking_time = p_booking_time and status = 'confirmed' and id <> p_booking_id;
    end if;
  end if;
  if v_taken is null then
    select coalesce(sum(party_size), 0) into v_taken
      from public.bookings
     where venue_slug = v_booking.venue_slug and booking_date = p_booking_date
       and booking_time = p_booking_time and status = 'confirmed' and id <> p_booking_id;
  end if;
  if v_taken + v_booking.party_size > v_capacity then
    raise exception 'Only % of % seats left at % for that time',
      greatest(v_capacity - v_taken, 0), v_capacity, v_venue.name
      using errcode = 'check_violation';
  end if;

  perform set_config('app.bypass_booking_guard', 'true', true);
  update public.bookings
     set booking_date = p_booking_date, booking_time = p_booking_time
   where id = p_booking_id
  returning * into v_booking;
  return v_booking;
end;
$$;

revoke all    on function public.reschedule_booking(uuid, date, time) from public;
grant  execute on function public.reschedule_booking(uuid, date, time) to authenticated;

-- ============================================================================
-- 7. STORAGE — avatars bucket (public read, owner-scoped writes)
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars: public read"  on storage.objects;
drop policy if exists "avatars: owner insert" on storage.objects;
drop policy if exists "avatars: owner update" on storage.objects;
drop policy if exists "avatars: owner delete" on storage.objects;

create policy "avatars: public read" on storage.objects for select
  using (bucket_id = 'avatars');
create policy "avatars: owner insert" on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: owner update" on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: owner delete" on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- 8. NOTIFICATIONS
-- ============================================================================
create table if not exists public.notifications (
  id          bigserial primary key,
  user_id     uuid not null references auth.users on delete cascade,
  kind        text not null check (kind in (
                'connection_request','connection_accepted','booking_updated',
                'connection_checkin','review_hidden','system')),
  title       text not null,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "notifications: read own"      on public.notifications;
drop policy if exists "notifications: mark read own" on public.notifications;
drop policy if exists "notifications: delete own"    on public.notifications;
create policy "notifications: read own" on public.notifications for select
  using (auth.uid() = user_id);
create policy "notifications: mark read own" on public.notifications for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notifications: delete own" on public.notifications for delete
  using (auth.uid() = user_id);
-- No insert policy: rows come only from the SECURITY DEFINER triggers below.

create or replace function public.enforce_notification_update_columns()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id or new.kind is distinct from old.kind
  or new.title is distinct from old.title or new.body is distinct from old.body
  or new.link is distinct from old.link or new.created_at is distinct from old.created_at then
    raise exception 'Notifications can only be marked as read' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
drop trigger if exists notifications_enforce_update_columns on public.notifications;
create trigger notifications_enforce_update_columns
  before update on public.notifications
  for each row execute function public.enforce_notification_update_columns();

create or replace function public.member_name(p_user_id uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select coalesce(nullif(btrim(display_name), ''), 'A member')
  from public.profiles where id = p_user_id;
$$;

create or replace function public.notify_connection_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    insert into public.notifications (user_id, kind, title, body, link)
    values (new.addressee_id, 'connection_request',
            public.member_name(new.requester_id) || ' wants to connect',
            'Accept or decline from the People page.',
            '/people');
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    insert into public.notifications (user_id, kind, title, body, link)
    values (new.requester_id, 'connection_accepted',
            public.member_name(new.addressee_id) || ' accepted your request',
            'You can now see each other''s plans.',
            '/people/' || new.addressee_id::text);
  end if;
  return new;
end;
$$;
drop trigger if exists connections_notify on public.connections;
create trigger connections_notify
  after insert or update on public.connections
  for each row execute function public.notify_connection_change();

create or replace function public.notify_booking_admin_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_name text;
begin
  if new.status is distinct from old.status and auth.uid() is distinct from new.user_id then
    select name into v_name from public.venues where slug = new.venue_slug;
    if new.status = 'completed' and auth.uid() is null then
      -- Set by the pg_cron job: the visit is over, invite a review.
      insert into public.notifications (user_id, kind, title, body, link)
      values (new.user_id, 'booking_updated',
              'How was ' || coalesce(v_name, new.venue_slug) || '?',
              'Your visit is complete — leave a review to help other members.',
              '/venues/' || new.venue_slug);
    else
      -- Changed by an admin.
      insert into public.notifications (user_id, kind, title, body, link)
      values (new.user_id, 'booking_updated',
              'Your booking at ' || coalesce(v_name, new.venue_slug) || ' was ' || new.status,
              to_char(new.booking_date, 'DD Mon') || ' at ' || to_char(new.booking_time, 'HH24:MI'),
              '/bookings');
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists bookings_notify_admin_change on public.bookings;
create trigger bookings_notify_admin_change
  after update on public.bookings
  for each row execute function public.notify_booking_admin_change();

create or replace function public.notify_connection_checkin()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_name text;
begin
  select name into v_name from public.venues where slug = new.venue_slug;
  insert into public.notifications (user_id, kind, title, body, link)
  select case when c.requester_id = new.user_id then c.addressee_id else c.requester_id end,
         'connection_checkin',
         public.member_name(new.user_id) || ' is going to ' || coalesce(v_name, new.venue_slug),
         to_char(new.checkin_date, 'Dy DD Mon') || coalesce(' · ' || new.note, ''),
         '/venues/' || new.venue_slug
  from public.connections c
  where c.status = 'accepted' and new.user_id in (c.requester_id, c.addressee_id);
  return new;
end;
$$;
drop trigger if exists presence_notify_connections on public.presence_checkins;
create trigger presence_notify_connections
  after insert on public.presence_checkins
  for each row execute function public.notify_connection_checkin();

create or replace function public.notify_review_hidden()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_name text;
begin
  if new.is_hidden and not old.is_hidden then
    select name into v_name from public.venues where slug = new.venue_slug;
    insert into public.notifications (user_id, kind, title, body, link)
    values (new.user_id, 'review_hidden',
            'Your review of ' || coalesce(v_name, new.venue_slug) || ' was hidden',
            'It no longer meets the community guidelines.',
            '/venues/' || new.venue_slug);
  end if;
  return new;
end;
$$;
drop trigger if exists reviews_notify_hidden on public.reviews;
create trigger reviews_notify_hidden
  after update on public.reviews
  for each row execute function public.notify_review_hidden();

-- One round-trip for the header badge.
drop function if exists public.unread_counts();
create function public.unread_counts()
returns table (dm_unread integer, notifications_unread integer)
language sql stable security definer set search_path = ''
as $$
  select
    (select count(*)::integer from public.direct_messages
      where recipient_id = auth.uid() and read_at is null),
    (select count(*)::integer from public.notifications
      where user_id = auth.uid() and read_at is null);
$$;
revoke execute on function public.unread_counts() from public;
grant  execute on function public.unread_counts() to authenticated;

-- ============================================================================
-- 9. RATE LIMITS — per-user sliding window, enforced in the database
--    TG_ARGV: [0] max rows, [1] window seconds, [2] user-id column
-- ============================================================================
create or replace function public.enforce_rate_limit()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_max     integer := tg_argv[0]::integer;
  v_window  interval := make_interval(secs => tg_argv[1]::integer);
  v_column  text := tg_argv[2];
  v_count   integer;
begin
  if public.is_admin() then return new; end if;
  execute format(
    'select count(*) from %I.%I where %I = $1 and created_at > now() - $2',
    tg_table_schema, tg_table_name, v_column)
    into v_count using auth.uid(), v_window;
  if v_count >= v_max then
    raise exception 'You are doing that too often. Please wait a moment.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;
  return new;
end;
$$;

drop trigger if exists chat_messages_rate_limit on public.chat_messages;
create trigger chat_messages_rate_limit before insert on public.chat_messages
  for each row execute function public.enforce_rate_limit('20', '60', 'user_id');

drop trigger if exists direct_messages_rate_limit on public.direct_messages;
create trigger direct_messages_rate_limit before insert on public.direct_messages
  for each row execute function public.enforce_rate_limit('30', '60', 'sender_id');

drop trigger if exists reports_rate_limit on public.reports;
create trigger reports_rate_limit before insert on public.reports
  for each row execute function public.enforce_rate_limit('5', '3600', 'reporter_id');

drop trigger if exists connections_rate_limit on public.connections;
create trigger connections_rate_limit before insert on public.connections
  for each row execute function public.enforce_rate_limit('20', '3600', 'requester_id');

-- ============================================================================
-- 10. INDEXES + connection uniqueness in both directions
-- ============================================================================
create index if not exists dm_recipient_thread_idx
  on public.direct_messages (recipient_id, sender_id, created_at desc);
create index if not exists audit_log_created_idx
  on public.audit_log (created_at desc);
create index if not exists profiles_created_idx
  on public.profiles (created_at desc);
create index if not exists profiles_display_name_trgm_idx
  on public.profiles using gin (display_name gin_trgm_ops);

do $$ begin
  create unique index if not exists connections_unordered_pair_idx
    on public.connections (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
exception when others then
  raise warning 'connections_unordered_pair_idx not created (%): duplicate A→B / B→A rows exist; delete one of each pair and re-run.', sqlerrm;
end $$;

-- ============================================================================
-- 11. fix_missing_profile(): never invent a date of birth
-- ============================================================================
create or replace function public.fix_missing_profile()
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email   text;
  v_name    text;
  v_dob     date;
begin
  if v_user_id is null then raise exception 'You must be signed in'; end if;
  if exists (select 1 from public.profiles where id = v_user_id) then
    return 'ok:already_exists';
  end if;
  select u.email::text,
         nullif(u.raw_user_meta_data ->> 'display_name', ''),
         (u.raw_user_meta_data ->> 'date_of_birth')::date
    into v_email, v_name, v_dob
    from auth.users u where u.id = v_user_id;
  if v_dob is null then
    return 'error:missing_dob';
  end if;
  insert into public.profiles (id, email, display_name, date_of_birth)
  values (v_user_id, v_email::citext, v_name, v_dob);
  return 'ok:created';
end;
$$;

-- ============================================================================
-- 12. delete_my_account() — GDPR Art. 17. Cascades through every FK.
-- ============================================================================
drop function if exists public.delete_my_account();
create function public.delete_my_account()
returns void language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'You must be signed in'; end if;
  -- Keep the audit trail: detach rather than delete admin actions.
  update public.audit_log set actor_id = null where actor_id = v_user_id;
  delete from auth.users where id = v_user_id;
end;
$$;
revoke execute on function public.delete_my_account() from public;
grant  execute on function public.delete_my_account() to authenticated;

-- ============================================================================
-- 13. Seed sensible hours for the existing venues (idempotent)
-- ============================================================================
update public.venues set opens_at = '08:00', closes_at = '23:00', category = 'cafe'
 where slug in ('mulliri','moncherie') and opens_at = '18:00';
update public.venues set opens_at = '10:00', closes_at = '23:59', category = 'lounge'
 where slug in ('sophie') and opens_at = '18:00';
update public.venues set opens_at = '17:00', closes_at = '23:59', category = 'lounge', price_band = 3
 where slug in ('le-chateau') and opens_at = '18:00';
