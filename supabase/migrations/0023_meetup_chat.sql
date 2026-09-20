-- ============================================================================
-- 0023_meetup_chat.sql
-- A group chat per meetup, for the people who are actually going.
-- Idempotent — safe to re-run. Run after 0022.
--
-- Venue chat is for everyone who booked at a venue; a meetup is a specific
-- table on a specific night, and "I'm running late" or "who's bringing the
-- cards" belongs to that group alone. Membership is the gate: the host and
-- anyone with status 'joined' can read and post. Pending requesters cannot
-- see the room — otherwise approval would mean nothing.
-- ============================================================================

create table if not exists public.meetup_messages (
  id         uuid primary key default gen_random_uuid(),
  meetup_id  uuid not null references public.meetups on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 1000),
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists meetup_messages_room_idx
  on public.meetup_messages (meetup_id, created_at desc);

alter table public.meetup_messages enable row level security;
grant select, insert, delete on public.meetup_messages to authenticated;

-- True for the host and confirmed guests. Security definer so the check is not
-- itself subject to meetup_members RLS (which would recurse into can_view_meetup).
create or replace function public.is_meetup_member(p_meetup_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.meetups m
             where m.id = p_meetup_id and m.host_id = auth.uid())
    or exists (select 1 from public.meetup_members mm
                where mm.meetup_id = p_meetup_id
                  and mm.user_id = auth.uid()
                  and mm.status = 'joined')
  );
$$;
revoke execute on function public.is_meetup_member(uuid) from public;
grant  execute on function public.is_meetup_member(uuid) to authenticated;

drop policy if exists "meetup_messages: read as member" on public.meetup_messages;
create policy "meetup_messages: read as member" on public.meetup_messages
for select to authenticated
using (
  public.is_admin()
  or (
    is_hidden = false
    and public.is_meetup_member(meetup_id)
    and not public.is_blocked_between(auth.uid(), user_id)
  )
);

drop policy if exists "meetup_messages: post as member" on public.meetup_messages;
create policy "meetup_messages: post as member" on public.meetup_messages
for insert to authenticated
with check (
  user_id = auth.uid()
  and is_hidden = false
  and public.is_meetup_member(meetup_id)
  and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_suspended = false
  )
  -- A cancelled meetup's room goes read-only; what is there stays readable.
  and exists (
    select 1 from public.meetups m where m.id = meetup_id and m.status <> 'cancelled'
  )
);

drop policy if exists "meetup_messages: delete own" on public.meetup_messages;
create policy "meetup_messages: delete own" on public.meetup_messages
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists "meetup_messages: admin moderates" on public.meetup_messages;
create policy "meetup_messages: admin moderates" on public.meetup_messages
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Reportable, like venue chat.
do $$ begin
  alter table public.reports drop constraint if exists reports_target_kind_check;
  alter table public.reports add constraint reports_target_kind_check check (
    target_kind in ('chat_message','direct_message','review','profile','venue',
                    'post','post_comment','meetup_message')
  );
end; $$;
