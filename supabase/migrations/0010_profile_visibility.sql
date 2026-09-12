-- ============================================================================
-- 0010_profile_visibility.sql
--
-- A safe public view of profiles for social features.
--
-- The raw `profiles` table carries email, date_of_birth and is_suspended —
-- none of which should be visible to arbitrary signed-in users. This view
-- exposes only the three fields other members legitimately need:
--   id            — to route a DM or block
--   display_name  — to show in the UI
--   avatar_url    — for the avatar chip
--
-- Suspended users are hidden from every social surface so they disappear
-- cleanly rather than appearing with a "(suspended)" label that reveals
-- moderation history.
--
-- Code in src/lib/people.ts already queries `public_profiles` and calls
-- `blocked_user_ids()`. This is the migration that makes those work.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- public_profiles — the only face of a member visible to other members.
-- ---------------------------------------------------------------------------
create or replace view public.public_profiles
with (security_invoker = true)
as
  select
    id,
    display_name,
    avatar_url
  from public.profiles
  where is_suspended = false;

-- Grant to authenticated only. Anon users cannot discover members.
grant select on public.public_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- blocked_user_ids() — symmetric block check from the caller's perspective.
--
-- "blocks: manage own" only returns rows where blocker_id = auth.uid(), so
-- a direct query on `blocks` would miss everyone who has blocked the caller.
-- This RPC runs security definer so it can see both directions without
-- exposing the full `blocks` table, and returns a flat array of ids to filter
-- on in application code.
-- ---------------------------------------------------------------------------
create or replace function public.blocked_user_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct other_id), '{}')
  from (
    select blocked_id  as other_id from public.blocks where blocker_id = auth.uid()
    union all
    select blocker_id  as other_id from public.blocks where blocked_id  = auth.uid()
  ) t;
$$;

comment on function public.blocked_user_ids is
  'Returns all user ids in a block relationship with the caller (both '
  'directions). Used to filter search results and social feeds so blocked '
  'users disappear completely rather than just being unable to send messages.';

revoke execute on function public.blocked_user_ids() from public;
grant  execute on function public.blocked_user_ids() to authenticated;
