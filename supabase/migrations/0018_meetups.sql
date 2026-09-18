-- ============================================================================
-- 0018_meetups.sql
-- Meetups: the "let's meet" loop. Idempotent — safe to re-run. Run after 0017.
--
-- Until now the app was reservation-first: you booked a table for yourself,
-- and whoever independently booked the same venue could chat. There was no way
-- to say "I'm hosting coffee at Mulliri on Friday at 20:00, six seats, join
-- me". A meetup is that.
--
-- Three decisions are baked into this schema:
--
--   1. THE HOST HOLDS THE BOOKING. create_meetup() calls book_venue() for the
--      whole party, and guests RSVP without a booking row of their own. The
--      venue therefore sees one reservation for six people, not six
--      reservations for one — and venue capacity stays correct, because it is
--      counted once. meetups.booking_id is that booking.
--   2. THE HOST PICKS WHO CAN JOIN, per meetup: open / approval / connections.
--   3. THE HOST PICKS WHO CAN SEE IT: public or connections-only.
--
-- Joining goes through join_meetup() for the same reason bookings go through
-- book_venue(): capacity has to be checked under a row lock, or two people
-- take the last seat at the same time.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. HELPER — are two people connected?
-- ----------------------------------------------------------------------------
-- Needed by the connections-only visibility and join policies. Definer because
-- the caller cannot read a connection row they are not part of.
create or replace function public.are_connected(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.connections
    where status = 'accepted'
      and ((requester_id = p_a and addressee_id = p_b)
        or (requester_id = p_b and addressee_id = p_a))
  );
$$;
revoke execute on function public.are_connected(uuid, uuid) from public;
grant  execute on function public.are_connected(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. TABLES
-- ----------------------------------------------------------------------------
create table if not exists public.meetups (
  id           uuid primary key default gen_random_uuid(),
  host_id      uuid not null references auth.users on delete cascade,
  venue_slug   text not null references public.venues on delete cascade,
  location_id  uuid references public.venue_locations on delete set null,
  -- The host's real reservation. SET NULL rather than CASCADE: if the booking
  -- is cancelled the meetup should survive long enough for the host to see it
  -- and tell people, not vanish from under its guests.
  booking_id   uuid references public.bookings on delete set null,
  title        text not null check (char_length(btrim(title)) between 3 and 120),
  description  text check (char_length(description) <= 1000),
  -- Split date/time, matching bookings, so every comparison in the app uses
  -- the same Europe/Tirane-local shape.
  meet_date    date not null,
  meet_time    time not null,
  -- Includes the host, so 2 is the smallest meetup that is actually a meeting.
  capacity     integer not null check (capacity between 2 and 20),
  join_policy  text not null default 'open'
                 check (join_policy in ('open','approval','connections')),
  visibility   text not null default 'public'
                 check (visibility in ('public','connections')),
  status       text not null default 'open'
                 check (status in ('open','cancelled','completed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists meetups_discovery_idx
  on public.meetups (meet_date, meet_time) where status = 'open';
create index if not exists meetups_venue_idx on public.meetups (venue_slug, meet_date);
create index if not exists meetups_host_idx  on public.meetups (host_id, meet_date desc);

create table if not exists public.meetup_members (
  id         uuid primary key default gen_random_uuid(),
  meetup_id  uuid not null references public.meetups on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  -- 'pending' only ever exists under join_policy = 'approval'.
  status     text not null default 'joined'
               check (status in ('joined','pending','declined','left')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meetup_id, user_id)
);

create index if not exists meetup_members_meetup_idx
  on public.meetup_members (meetup_id, status);
create index if not exists meetup_members_user_idx
  on public.meetup_members (user_id, status);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'meetups_touch_updated_at'
    and tgrelid = 'public.meetups'::regclass) then
    create trigger meetups_touch_updated_at before update on public.meetups
      for each row execute function public.touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'meetup_members_touch_updated_at'
    and tgrelid = 'public.meetup_members'::regclass) then
    create trigger meetup_members_touch_updated_at before update on public.meetup_members
      for each row execute function public.touch_updated_at();
  end if;
end; $$;

alter table public.meetups        enable row level security;
alter table public.meetup_members enable row level security;

-- Explicit, rather than leaning on the default privileges Supabase grants on
-- public-schema tables. SELECT and UPDATE only: INSERT and DELETE are not
-- granted at all, because every write goes through create_meetup(),
-- join_meetup(), respond_to_join_request() and cancel_meetup(), which are
-- SECURITY DEFINER. A client that tried to insert its way past the capacity
-- lock is refused by the grant before RLS is even consulted.
grant select, update on public.meetups        to authenticated;
grant select, update on public.meetup_members to authenticated;

-- ----------------------------------------------------------------------------
-- 3. ROW-LEVEL SECURITY
-- ----------------------------------------------------------------------------
-- There is no INSERT policy on meetups and no INSERT policy on meetup_members:
-- create_meetup() and join_meetup() are the only ways in, exactly as
-- book_venue() is the only way into bookings. Writing directly would skip the
-- capacity lock and the age check.
--
-- The visibility rule lives in a SECURITY DEFINER function rather than inline
-- in the policy, and that is not a style choice. "Can I see this meetup?"
-- depends on meetup_members, and "can I see this membership?" depends on
-- meetups. Expressed as two policies that each subquery the other's table,
-- Postgres raises `infinite recursion detected in policy for relation
-- "meetups"` the first time either is read. A definer function bypasses RLS on
-- the tables it touches, which breaks the cycle in both directions and keeps
-- the rule written down once.

create or replace function public.can_view_meetup(p_meetup_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_m    public.meetups;
begin
  if v_user is null then return false; end if;
  if public.is_admin() then return true; end if;

  select * into v_m from public.meetups where id = p_meetup_id;
  if not found then return false; end if;

  -- The host, and anyone already involved, can always see it — including
  -- after it is cancelled, so it does not disappear from under them.
  if v_m.host_id = v_user then return true; end if;
  if exists (
    select 1 from public.meetup_members
    where meetup_id = p_meetup_id and user_id = v_user
      and status in ('joined','pending')
  ) then
    return true;
  end if;

  if v_m.status <> 'open' then return false; end if;
  -- A block hides it in both directions.
  if v_m.host_id = any (public.blocked_user_ids()) then return false; end if;

  return v_m.visibility = 'public'
      or (v_m.visibility = 'connections'
          and public.are_connected(v_user, v_m.host_id));
end;
$$;
revoke execute on function public.can_view_meetup(uuid) from public;
grant  execute on function public.can_view_meetup(uuid) to authenticated;

drop policy if exists "meetups: read visible" on public.meetups;
create policy "meetups: read visible" on public.meetups for select to authenticated
using (public.can_view_meetup(id));

drop policy if exists "meetups: host updates own" on public.meetups;
create policy "meetups: host updates own" on public.meetups for update to authenticated
using (host_id = auth.uid() or public.is_admin())
with check (host_id = auth.uid() or public.is_admin());

drop policy if exists "meetup_members: read for visible meetups" on public.meetup_members;
create policy "meetup_members: read for visible meetups" on public.meetup_members
for select to authenticated
using (user_id = auth.uid() or public.can_view_meetup(meetup_id));

drop policy if exists "meetup_members: leave own" on public.meetup_members;
create policy "meetup_members: leave own" on public.meetup_members
for update to authenticated
using (user_id = auth.uid())
-- Only ever to 'left'. Promoting yourself from pending to joined would be
-- exactly the hole the approval policy exists to close.
with check (user_id = auth.uid() and status = 'left');

-- ----------------------------------------------------------------------------
-- 4. NOTIFICATIONS — extend the existing kind whitelist
-- ----------------------------------------------------------------------------
do $$ begin
  alter table public.notifications drop constraint if exists notifications_kind_check;
  alter table public.notifications add constraint notifications_kind_check check (kind in (
    'connection_request','connection_accepted','booking_updated',
    'connection_checkin','review_hidden','system',
    'meetup_join_request','meetup_approved','meetup_declined',
    'meetup_joined','meetup_cancelled'
  ));
end; $$;

-- ----------------------------------------------------------------------------
-- 5. CREATE — books the table and opens the meetup in one transaction
-- ----------------------------------------------------------------------------
drop function if exists public.create_meetup(text, date, time, integer, text, text, uuid, text, text, text);
create function public.create_meetup(
  p_venue_slug  text,
  p_meet_date   date,
  p_meet_time   time,
  p_capacity    integer,
  p_title       text,
  p_description text default null,
  p_location_id uuid default null,
  p_join_policy text default 'open',
  p_visibility  text default 'public',
  p_notes       text default null
)
returns public.meetups
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_booking public.bookings;
  v_meetup  public.meetups;
begin
  if v_user_id is null then
    raise exception 'You must be signed in' using errcode = 'insufficient_privilege';
  end if;

  -- book_venue() does the real work: it checks suspension, past times, opening
  -- hours, the venue's age limits and remaining capacity, all under a row
  -- lock. Reimplementing any of that here would mean two sets of rules to keep
  -- in step. If it raises, the whole transaction rolls back and no orphan
  -- meetup is left pointing at a booking that was never made.
  v_booking := public.book_venue(
    p_venue_slug, p_meet_date, p_meet_time, p_capacity, p_location_id, p_notes
  );

  insert into public.meetups (
    host_id, venue_slug, location_id, booking_id, title, description,
    meet_date, meet_time, capacity, join_policy, visibility
  ) values (
    v_user_id, p_venue_slug, p_location_id, v_booking.id, btrim(p_title),
    nullif(btrim(p_description), ''), p_meet_date, p_meet_time, p_capacity,
    p_join_policy, p_visibility
  ) returning * into v_meetup;

  -- The host occupies one of their own seats.
  insert into public.meetup_members (meetup_id, user_id, status)
  values (v_meetup.id, v_user_id, 'joined');

  return v_meetup;
end;
$$;
revoke all    on function public.create_meetup(text, date, time, integer, text, text, uuid, text, text, text) from public;
grant  execute on function public.create_meetup(text, date, time, integer, text, text, uuid, text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. JOIN — the capacity gate
-- ----------------------------------------------------------------------------
-- Returns the resulting status: 'joined' or 'pending'.
drop function if exists public.join_meetup(uuid);
create function public.join_meetup(p_meetup_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id  uuid := auth.uid();
  v_meetup   public.meetups;
  v_venue    public.venues;
  v_profile  public.profiles;
  v_existing public.meetup_members;
  -- Explicit, because FOUND is rewritten by every subsequent query — including
  -- the SELECT count(*) below, which always "finds" a row. Relying on FOUND
  -- after it made this function silently skip the INSERT and report success.
  v_has_row  boolean;
  v_taken    integer;
  v_status   text;
  v_now_local timestamp := (now() at time zone 'Europe/Tirane');
begin
  if v_user_id is null then
    raise exception 'You must be signed in' using errcode = 'insufficient_privilege';
  end if;

  select * into v_profile from public.profiles where id = v_user_id;
  if not found then raise exception 'Profile not found'; end if;
  if v_profile.is_suspended then
    raise exception 'This account is suspended' using errcode = 'insufficient_privilege';
  end if;

  -- FOR UPDATE: this is the lock that makes the capacity check below safe.
  -- Without it two people can both read "5 of 6 taken" and both join.
  select * into v_meetup from public.meetups where id = p_meetup_id for update;
  if not found then raise exception 'That meetup no longer exists'; end if;
  if v_meetup.status <> 'open' then
    raise exception 'That meetup is no longer open';
  end if;
  if v_meetup.host_id = v_user_id then
    raise exception 'You are the host';
  end if;
  if (v_meetup.meet_date + v_meetup.meet_time) < v_now_local then
    raise exception 'That meetup has already started';
  end if;

  -- Visibility is re-checked HERE, not only in the SELECT policy.
  --
  -- RLS decides what appears in a listing. It does not decide what a
  -- SECURITY DEFINER function will do when handed an id directly — and this
  -- function is reachable over the API by anyone signed in. Without this,
  -- a connections-only meetup was hidden from strangers but still joinable
  -- by any stranger who got hold of its id.
  --
  -- can_view_meetup() carries the same rule as the policy (visibility,
  -- blocks, existing membership), so the two cannot drift apart. The error
  -- deliberately matches the not-found message: telling someone "you are not
  -- allowed to see that" confirms it exists.
  if not public.can_view_meetup(p_meetup_id) then
    raise exception 'That meetup no longer exists';
  end if;

  if v_meetup.join_policy = 'connections'
     and not public.are_connected(v_user_id, v_meetup.host_id) then
    raise exception 'That meetup is open to the host''s connections only';
  end if;

  -- The venue's age limits apply to guests too. The host's booking cleared
  -- them for the host only, and a 25+ bar does not stop being 25+ because
  -- somebody else made the reservation.
  select * into v_venue from public.venues where slug = v_meetup.venue_slug;
  if public.age_years(v_profile.date_of_birth) not between v_venue.min_age and v_venue.max_age then
    raise exception 'This venue admits ages % to %', v_venue.min_age, v_venue.max_age
      using errcode = 'check_violation';
  end if;

  -- Existing membership is resolved BEFORE capacity, so that someone who is
  -- already going and re-opens a now-full meetup gets their own status back
  -- rather than "That meetup is full". The UI calls this on a button that is
  -- easy to press twice.
  select * into v_existing from public.meetup_members
   where meetup_id = p_meetup_id and user_id = v_user_id;
  v_has_row := found;

  if v_has_row and v_existing.status = 'joined'  then return 'joined';  end if;
  if v_has_row and v_existing.status = 'pending' then return 'pending'; end if;

  select count(*) into v_taken from public.meetup_members
   where meetup_id = p_meetup_id and status = 'joined';
  if v_taken >= v_meetup.capacity then
    raise exception 'That meetup is full' using errcode = 'check_violation';
  end if;

  v_status := case when v_meetup.join_policy = 'approval' then 'pending' else 'joined' end;

  if v_has_row then
    -- 'left' or 'declined' → allowed to ask again.
    update public.meetup_members set status = v_status
     where id = v_existing.id;
  else
    insert into public.meetup_members (meetup_id, user_id, status)
    values (p_meetup_id, v_user_id, v_status);
  end if;

  insert into public.notifications (user_id, kind, title, body, link)
  values (
    v_meetup.host_id,
    case when v_status = 'pending' then 'meetup_join_request' else 'meetup_joined' end,
    case when v_status = 'pending'
         then coalesce(v_profile.display_name, 'Someone') || ' asked to join ' || v_meetup.title
         else coalesce(v_profile.display_name, 'Someone') || ' joined ' || v_meetup.title end,
    null,
    '/meetups/' || v_meetup.id
  );

  return v_status;
end;
$$;
revoke all    on function public.join_meetup(uuid) from public;
grant  execute on function public.join_meetup(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. HOST DECIDES ON A PENDING REQUEST
-- ----------------------------------------------------------------------------
drop function if exists public.respond_to_join_request(uuid, uuid, boolean);
create function public.respond_to_join_request(
  p_meetup_id uuid,
  p_user_id   uuid,
  p_approve   boolean
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_meetup  public.meetups;
  v_taken   integer;
begin
  select * into v_meetup from public.meetups where id = p_meetup_id for update;
  if not found then raise exception 'That meetup no longer exists'; end if;
  if v_meetup.host_id <> v_user_id and not public.is_admin() then
    raise exception 'Only the host can do that' using errcode = 'insufficient_privilege';
  end if;

  if p_approve then
    -- Re-checked at approval time, not just at request time: the host may have
    -- approved others since, and the seats may now be gone.
    select count(*) into v_taken from public.meetup_members
     where meetup_id = p_meetup_id and status = 'joined';
    if v_taken >= v_meetup.capacity then
      raise exception 'That meetup is full' using errcode = 'check_violation';
    end if;
  end if;

  update public.meetup_members
     set status = case when p_approve then 'joined' else 'declined' end
   where meetup_id = p_meetup_id and user_id = p_user_id and status = 'pending';

  if not found then return 'no_pending_request'; end if;

  insert into public.notifications (user_id, kind, title, body, link)
  values (
    p_user_id,
    case when p_approve then 'meetup_approved' else 'meetup_declined' end,
    case when p_approve then 'You are going to ' || v_meetup.title
         else 'Your request to join ' || v_meetup.title || ' was declined' end,
    null,
    '/meetups/' || v_meetup.id
  );

  return case when p_approve then 'joined' else 'declined' end;
end;
$$;
revoke all    on function public.respond_to_join_request(uuid, uuid, boolean) from public;
grant  execute on function public.respond_to_join_request(uuid, uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. CANCEL — host only, tells everyone who was going
-- ----------------------------------------------------------------------------
drop function if exists public.cancel_meetup(uuid);
create function public.cancel_meetup(p_meetup_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_meetup  public.meetups;
begin
  select * into v_meetup from public.meetups where id = p_meetup_id for update;
  if not found then raise exception 'That meetup no longer exists'; end if;
  if v_meetup.host_id <> v_user_id and not public.is_admin() then
    raise exception 'Only the host can cancel' using errcode = 'insufficient_privilege';
  end if;

  update public.meetups set status = 'cancelled' where id = p_meetup_id;

  -- Everyone who was going hears about it. The host already knows.
  insert into public.notifications (user_id, kind, title, body, link)
  select m.user_id, 'meetup_cancelled',
         v_meetup.title || ' was cancelled', null, '/meetups'
  from public.meetup_members m
  where m.meetup_id = p_meetup_id and m.status in ('joined','pending')
    and m.user_id <> v_meetup.host_id;

  -- The table itself is released through the normal booking path, so the
  -- cancel-only trigger on bookings still applies.
  if v_meetup.booking_id is not null then
    update public.bookings set status = 'cancelled'
     where id = v_meetup.booking_id and status = 'confirmed';
  end if;

  return true;
end;
$$;
revoke all    on function public.cancel_meetup(uuid) from public;
grant  execute on function public.cancel_meetup(uuid) to authenticated;
