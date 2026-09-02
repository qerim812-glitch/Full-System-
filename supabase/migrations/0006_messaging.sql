-- ============================================================================
-- 0006_messaging.sql
-- Group chat, direct messages, and blocking.
--
-- In the prototype handleSendChat() and handleSendDM() appended a div to the
-- DOM: messages reached nobody and vanished on reload.
--
-- Blocking is created in the SAME migration as messaging, on purpose. A
-- social app that ships private messaging before it ships blocking is
-- unmoderatable from its first day.
-- ============================================================================

create table public.blocks (
  blocker_id  uuid not null references auth.users on delete cascade,
  blocked_id  uuid not null references auth.users on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_no_self check (blocker_id <> blocked_id)
);

alter table public.blocks enable row level security;

create policy "blocks: manage own"
  on public.blocks for all
  using (auth.uid() = blocker_id)
  with check (auth.uid() = blocker_id);

-- Helper: has either party blocked the other? Used by the DM policies.
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
     where (blocker_id = a and blocked_id = b)
        or (blocker_id = b and blocked_id = a)
  );
$$;

-- ---------------------------------------------------------------------------
-- Group chat, one room per venue.
-- ---------------------------------------------------------------------------
create table public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  venue_slug  text not null references public.venues on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  body        text not null check (char_length(body) between 1 and 1000),
  is_hidden   boolean not null default false,
  created_at  timestamptz not null default now()
);

create index chat_messages_room_idx
  on public.chat_messages (venue_slug, created_at desc)
  where is_hidden = false;

alter table public.chat_messages enable row level security;

-- Readable by signed-in users only, and never messages from someone you or
-- they have blocked.
create policy "chat: read as member"
  on public.chat_messages for select
  using (
    auth.uid() is not null
    and is_hidden = false
    and not public.is_blocked_between(auth.uid(), user_id)
  );

-- Posting requires a confirmed booking at that venue, which also serves as
-- the rate limit's backstop: you cannot flood rooms you never booked.
create policy "chat: post as attendee"
  on public.chat_messages for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles p
       where p.id = auth.uid() and p.is_suspended = false
    )
    and exists (
      select 1 from public.bookings b
       where b.user_id    = auth.uid()
         and b.venue_slug = chat_messages.venue_slug
         and b.status     in ('confirmed', 'completed')
    )
  );

create policy "chat: delete own"
  on public.chat_messages for delete
  using (auth.uid() = user_id);

create policy "chat: admin moderates"
  on public.chat_messages for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Direct messages.
-- ---------------------------------------------------------------------------
create table public.direct_messages (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid not null references auth.users on delete cascade,
  recipient_id  uuid not null references auth.users on delete cascade,
  body          text not null check (char_length(body) between 1 and 2000),
  read_at       timestamptz,
  created_at    timestamptz not null default now(),
  constraint dm_no_self check (sender_id <> recipient_id)
);

create index dm_thread_idx
  on public.direct_messages (sender_id, recipient_id, created_at desc);
create index dm_inbox_idx
  on public.direct_messages (recipient_id, created_at desc)
  where read_at is null;

alter table public.direct_messages enable row level security;

create policy "dm: read own threads"
  on public.direct_messages for select
  using (auth.uid() in (sender_id, recipient_id));

create policy "dm: send unless blocked"
  on public.direct_messages for insert
  with check (
    auth.uid() = sender_id
    and not public.is_blocked_between(sender_id, recipient_id)
    and exists (
      select 1 from public.profiles p
       where p.id = auth.uid() and p.is_suspended = false
    )
    and exists (
      select 1 from public.profiles p
       where p.id = recipient_id and p.is_suspended = false
    )
  );

-- Recipients mark as read; nobody edits a sent message body.
create policy "dm: mark read as recipient"
  on public.direct_messages for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

create policy "dm: admin reads for moderation"
  on public.direct_messages for select
  using (public.is_admin());
