-- ============================================================================
-- 0010_profile_visibility.sql
--
-- Messaging needs one member to see another's name. public.profiles grants
-- only "read own" and "admin reads all", so chat would have rendered raw
-- UUIDs and there would be no way to find anyone to message.
--
-- Why a view rather than another policy on profiles:
--
-- The obvious fix -- a broad select policy plus column-level GRANTs -- does
-- not work. Column privileges attach to the ROLE, not to a policy, so
-- revoking `email` from `authenticated` in order to hide it from strangers
-- would also hide it from the owner's own account page. RLS is row-level; it
-- cannot express "these columns for other people, every column for yourself".
--
-- A view can. public_profiles exposes exactly three columns and nothing else.
-- It is deliberately NOT security_invoker: it runs with its owner's rights
-- and so bypasses the strict RLS on profiles, which is the whole point.
-- profiles itself stays locked down exactly as 0002 left it.
--
-- Suspended accounts are filtered out here, so a suspended user disappears
-- from search and from message attribution without any app-layer check.
-- ============================================================================

create or replace view public.public_profiles as
  select
    p.id,
    p.display_name,
    p.avatar_url
  from public.profiles p
  where p.is_suspended = false;

comment on view public.public_profiles is
  'The only projection of a profile that another member may read: display '
  'name and avatar, never email or date_of_birth. Security definer by '
  'design -- it exists to bypass the read-own-only RLS on profiles. Do not '
  'add columns here without treating it as a privacy change.';

-- anon must not enumerate the member list; signed-in users may.
revoke all on public.public_profiles from anon;
revoke all on public.public_profiles from public;
grant select on public.public_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Who is invisible to me because of a block.
--
-- "blocks: manage own" scopes selects to blocker_id = auth.uid(), so a plain
-- query returns only the people I blocked, never the people who blocked me.
-- That asymmetry is correct -- you should not be able to enumerate who
-- blocked you -- but it means the app cannot filter them out of search on its
-- own, and the user would only discover the block when the send failed.
--
-- security definer so it can see both directions, returning a flat set of
-- ids without revealing which way the block runs.
-- ---------------------------------------------------------------------------
create or replace function public.blocked_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when b.blocker_id = auth.uid() then b.blocked_id
           else b.blocker_id
         end
    from public.blocks b
   where b.blocker_id = auth.uid()
      or b.blocked_id = auth.uid();
$$;

comment on function public.blocked_user_ids is
  'Ids the caller cannot interact with, in either direction. Returns only '
  'the id set, never which party did the blocking.';

revoke execute on function public.blocked_user_ids() from public, anon;
grant execute on function public.blocked_user_ids() to authenticated;
