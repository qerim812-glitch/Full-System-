-- ============================================================================
-- 0012_social.sql
--
-- Social graph: connections (mutual follow), presence opt-in check-ins,
-- venue social feed, and a profile-repair utility.
--
-- Design notes:
--   * Connections are MUTUAL — both parties must consent before attendance
--     is visible to each other (pending → accepted).
--   * Presence is a separate opt-in from bookings. A booking is a private
--     transaction; a check-in is a social signal the user broadcasts to
--     their accepted connections.
--   * fix_missing_profile() repairs accounts (typically the first admin)
--     created before the handle_new_user() trigger existed.
--   * The partial index bug (current_date in WHERE) from the first draft is
--     fixed — the index covers all rows; the application filters by date.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. CONNECTIONS
-- ---------------------------------------------------------------------------
create table if not exists public.connections (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references auth.users on delete cascade,
  addressee_id  uuid not null references auth.users on delete cascade,
  status        text not null default 'pending'
                  check (status in ('pending', 'accepted', 'declined')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint connections_no_self   check (requester_id <> addressee_id),
  constraint connections_unique_pair unique (requester_id, addressee_id)
);

create index if not exists connections_addressee_idx
  on public.connections (addressee_id, status);
create index if not exists connections_requester_idx
  on public.connections (requester_id, status);

-- Only create trigger if it doesn't already exist
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'connections_touch_updated_at'
      and tgrelid = 'public.connections'::regclass
  ) then
    create trigger connections_touch_updated_at
      before update on public.connections
      for each row execute function public.touch_updated_at();
  end if;
end;
$$;

alter table public.connections enable row level security;

drop policy if exists "connections: read own"          on public.connections;
drop policy if exists "connections: request"           on public.connections;
drop policy if exists "connections: respond"           on public.connections;
drop policy if exists "connections: withdraw or remove" on public.connections;

create policy "connections: read own"
  on public.connections for select
  using (auth.uid() in (requester_id, addressee_id));

create policy "connections: request"
  on public.connections for insert
  with check (
    auth.uid() = requester_id
    and not public.is_blocked_between(requester_id, addressee_id)
    and exists (
      select 1 from public.profiles p
       where p.id = auth.uid() and p.is_suspended = false
    )
  );

create policy "connections: respond"
  on public.connections for update
  using (auth.uid() = addressee_id)
  with check (auth.uid() = addressee_id);

create policy "connections: withdraw or remove"
  on public.connections for delete
  using (auth.uid() in (requester_id, addressee_id));

-- ---------------------------------------------------------------------------
-- 2. PRESENCE CHECK-INS
-- ---------------------------------------------------------------------------
create table if not exists public.presence_checkins (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  venue_slug    text not null references public.venues on delete cascade,
  checkin_date  date not null,
  note          text check (char_length(note) <= 280),
  created_at    timestamptz not null default now(),
  unique (user_id, venue_slug, checkin_date)
);

-- Plain index — no WHERE predicate using non-immutable functions
create index if not exists presence_venue_date_idx
  on public.presence_checkins (venue_slug, checkin_date);

create index if not exists presence_user_idx
  on public.presence_checkins (user_id, checkin_date);

alter table public.presence_checkins enable row level security;

drop policy if exists "presence: read own"          on public.presence_checkins;
drop policy if exists "presence: read connections"  on public.presence_checkins;
drop policy if exists "presence: manage own"        on public.presence_checkins;
drop policy if exists "presence: update own"        on public.presence_checkins;
drop policy if exists "presence: delete own"        on public.presence_checkins;

-- Your own check-ins always visible
create policy "presence: read own"
  on public.presence_checkins for select
  using (auth.uid() = user_id);

-- Check-ins from accepted mutual connections (either direction)
create policy "presence: read connections"
  on public.presence_checkins for select
  using (
    auth.uid() is not null
    and not public.is_blocked_between(auth.uid(), user_id)
    and exists (
      select 1 from public.connections c
       where c.status = 'accepted'
         and (
           (c.requester_id = auth.uid() and c.addressee_id = user_id)
           or
           (c.requester_id = user_id    and c.addressee_id = auth.uid())
         )
    )
  );

create policy "presence: manage own"
  on public.presence_checkins for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles p
       where p.id = auth.uid() and p.is_suspended = false
    )
  );

create policy "presence: update own"
  on public.presence_checkins for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "presence: delete own"
  on public.presence_checkins for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. RPC: my_connections()
-- ---------------------------------------------------------------------------
create or replace function public.my_connections()
returns table (
  connection_id  uuid,
  user_id        uuid,
  display_name   text,
  avatar_url     text,
  connected_at   timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id                                         as connection_id,
    p.id                                         as user_id,
    p.display_name,
    p.avatar_url,
    c.updated_at                                 as connected_at
  from public.connections c
  join public.profiles p
    on p.id = case
                when c.requester_id = auth.uid() then c.addressee_id
                else c.requester_id
              end
  where c.status = 'accepted'
    and auth.uid() in (c.requester_id, c.addressee_id)
    and p.is_suspended = false
  order by p.display_name;
$$;

revoke execute on function public.my_connections() from public;
grant  execute on function public.my_connections() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC: pending_connection_requests()
-- ---------------------------------------------------------------------------
create or replace function public.pending_connection_requests()
returns table (
  connection_id  uuid,
  requester_id   uuid,
  display_name   text,
  avatar_url     text,
  requested_at   timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id           as connection_id,
    c.requester_id,
    p.display_name,
    p.avatar_url,
    c.created_at   as requested_at
  from public.connections c
  join public.profiles p on p.id = c.requester_id
  where c.addressee_id = auth.uid()
    and c.status = 'pending'
    and p.is_suspended = false
  order by c.created_at desc;
$$;

revoke execute on function public.pending_connection_requests() from public;
grant  execute on function public.pending_connection_requests() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPC: mutual_connections(other_id)
-- ---------------------------------------------------------------------------
create or replace function public.mutual_connections(p_other_id uuid)
returns table (
  user_id       uuid,
  display_name  text,
  avatar_url    text
)
language sql
stable
security definer
set search_path = ''
as $$
  with my_ids as (
    select case
             when requester_id = auth.uid() then addressee_id
             else requester_id
           end as uid
    from public.connections
    where status = 'accepted'
      and auth.uid() in (requester_id, addressee_id)
  ),
  their_ids as (
    select case
             when requester_id = p_other_id then addressee_id
             else requester_id
           end as uid
    from public.connections
    where status = 'accepted'
      and p_other_id in (requester_id, addressee_id)
  )
  select p.id, p.display_name, p.avatar_url
  from   my_ids m
  join   their_ids t on t.uid = m.uid
  join   public.profiles p on p.id = m.uid
  where  p.is_suspended = false
  order by p.display_name;
$$;

revoke execute on function public.mutual_connections(uuid) from public;
grant  execute on function public.mutual_connections(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC: venue_social_feed(venue_slug, date)
-- ---------------------------------------------------------------------------
create or replace function public.venue_social_feed(
  p_venue_slug  text,
  p_date        date default current_date
)
returns table (
  user_id       uuid,
  display_name  text,
  avatar_url    text,
  note          text,
  checkin_date  date
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id           as user_id,
    p.display_name,
    p.avatar_url,
    pc.note,
    pc.checkin_date
  from public.presence_checkins pc
  join public.profiles p on p.id = pc.user_id
  -- only accepted connections
  join public.connections c
    on  c.status = 'accepted'
    and (
          (c.requester_id = auth.uid() and c.addressee_id = pc.user_id)
       or (c.requester_id = pc.user_id and c.addressee_id = auth.uid())
    )
  where pc.venue_slug   = p_venue_slug
    and pc.checkin_date = p_date
    and p.is_suspended  = false
    and not public.is_blocked_between(auth.uid(), pc.user_id)
  order by p.display_name;
$$;

revoke execute on function public.venue_social_feed(text, date) from public;
grant  execute on function public.venue_social_feed(text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. fix_missing_profile()
--    For accounts created before handle_new_user() existed (e.g. first admin).
--    Idempotent — safe to run multiple times.
-- ---------------------------------------------------------------------------
create or replace function public.fix_missing_profile()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id  uuid   := auth.uid();
  v_email    citext;
  v_name     text;
  v_dob      date;
  v_count    integer;
begin
  if v_user_id is null then
    raise exception 'You must be signed in';
  end if;

  select count(*) into v_count
    from public.profiles
   where id = v_user_id;

  if v_count > 0 then
    return 'ok:already_exists';
  end if;

  -- Reach into auth.users (only possible via security definer)
  select
    u.email::citext,
    nullif(u.raw_user_meta_data ->> 'display_name', ''),
    (u.raw_user_meta_data ->> 'date_of_birth')::date
  into v_email, v_name, v_dob
  from auth.users u
  where u.id = v_user_id;

  -- Admin accounts often have no date_of_birth in metadata; default to 18 yrs ago.
  if v_dob is null then
    v_dob := (current_date - interval '18 years')::date;
  end if;

  insert into public.profiles (id, email, display_name, date_of_birth)
  values (v_user_id, v_email, v_name, v_dob);

  return 'ok:created';
end;
$$;

revoke execute on function public.fix_missing_profile() from public;
grant  execute on function public.fix_missing_profile() to authenticated;

comment on function public.fix_missing_profile is
  'Creates a profile row for the signed-in user when handle_new_user() did '
  'not fire (accounts created before migrations ran). Idempotent.';
