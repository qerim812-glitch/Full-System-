-- ============================================================================
-- 0019_profiles_and_safety.sql
-- Richer profiles, photo verification, and host moderation of a meetup.
-- Idempotent — safe to re-run. Run after 0018.
--
-- Two things this app asks of people that it had not earned: decide whether to
-- meet a stranger from a name and an avatar, and trust that the stranger is
-- who they say they are. This adds the material for the first (bio, interests)
-- and a mechanism for the second (a reviewed photo check and a badge).
--
-- NOTE ON THE COLUMN GUARD: enforce_profile_update_columns() from 0014 is a
-- DENYLIST — it names the columns a member may not change and allows the rest.
-- So `bio` and `interests` are editable by their owner with no change needed,
-- but `is_verified` MUST be added to that list or any member could mark
-- themselves verified with a single PATCH. That is done below.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROFILE CONTENT
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists bio         text check (char_length(bio) <= 500),
  add column if not exists interests   text[] not null default '{}',
  add column if not exists is_verified boolean not null default false;

-- A curated vocabulary rather than free text: shared interests are only useful
-- for matching if two people spell them the same way. Adding one later is a
-- one-line migration, which is the right amount of friction.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_interests_known' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_interests_known check (
      interests <@ array[
        'coffee','cocktails','live-music','football','board-games','books',
        'art','tech','travel','food','dancing','cinema','hiking',
        'photography','languages','fitness'
      ]::text[]
      and cardinality(interests) <= 8
    );
  end if;
end; $$;

-- GIN, because the discovery feed asks "who shares an interest with me", which
-- is an array-overlap (&&) query. A btree index cannot answer that.
create index if not exists profiles_interests_idx
  on public.profiles using gin (interests);

-- Rebuilt with is_verified added. Everything else is unchanged from 0014.
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
  -- Added in 0019. Without this a member could self-verify, which would make
  -- the badge worthless — it means "a human checked this", not "I said so".
  or new.is_verified   is distinct from old.is_verified
  then
    raise exception 'That field cannot be changed'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- public_profiles is what other members read. Rebuilt to carry the new fields;
-- it still exposes no email and no date of birth.
drop view if exists public.public_profiles cascade;
create view public.public_profiles
with (security_invoker = false) as
  select id, display_name, avatar_url, bio, interests, is_verified, created_at
  from public.profiles
  where is_suspended = false;
-- Same posture as 0014: authenticated only. Recreating the view resets its
-- ACL, so the revoke has to be repeated or anon would inherit the schema
-- default and be able to read every member's profile.
revoke all   on public.public_profiles from public, anon;
grant select on public.public_profiles to authenticated;

-- ----------------------------------------------------------------------------
-- 2. PHOTO VERIFICATION
-- ----------------------------------------------------------------------------
-- A member uploads a photo; an admin compares it with the profile picture and
-- approves or rejects. No automated face matching and no third party: the
-- badge claims only "a human looked at this", which is what it should mean.
create table if not exists public.verification_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  photo_path  text not null,
  status      text not null default 'pending'
                check (status in ('pending','approved','rejected')),
  note        text check (char_length(note) <= 500),
  reviewed_by uuid references auth.users on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);

-- One open request per person. A partial unique index rather than a plain one,
-- so a rejected request does not block trying again.
create unique index if not exists verification_one_pending
  on public.verification_requests (user_id) where status = 'pending';
create index if not exists verification_queue_idx
  on public.verification_requests (status, created_at);

alter table public.verification_requests enable row level security;
grant select, insert on public.verification_requests to authenticated;

drop policy if exists "verification: read own" on public.verification_requests;
create policy "verification: read own" on public.verification_requests
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "verification: request own" on public.verification_requests;
create policy "verification: request own" on public.verification_requests
for insert to authenticated
-- status is pinned to 'pending': a member opens a request, they do not decide
-- its outcome. Only review_verification() below can move it.
with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "verification: admin manages" on public.verification_requests;
create policy "verification: admin manages" on public.verification_requests
for update to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Admin decision. Flips the badge and closes the request together, so the two
-- can never disagree.
drop function if exists public.review_verification(uuid, boolean, text);
create function public.review_verification(
  p_request_id uuid,
  p_approve    boolean,
  p_note       text default null
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_request public.verification_requests;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select * into v_request from public.verification_requests
   where id = p_request_id and status = 'pending' for update;
  if not found then return false; end if;

  update public.verification_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         note = nullif(btrim(p_note), ''),
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_request_id;

  if p_approve then
    update public.profiles set is_verified = true where id = v_request.user_id;
  end if;

  insert into public.notifications (user_id, kind, title, body, link)
  values (v_request.user_id, 'system',
          case when p_approve then 'Your profile is verified'
               else 'Photo verification was not approved' end,
          nullif(btrim(p_note), ''), '/account');

  return true;
end;
$$;
revoke all    on function public.review_verification(uuid, boolean, text) from public;
grant  execute on function public.review_verification(uuid, boolean, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. HOST MODERATION — remove someone from a meetup
-- ----------------------------------------------------------------------------
-- A host who cannot remove a guest has only one lever: cancel on everybody.
drop function if exists public.remove_meetup_attendee(uuid, uuid);
create function public.remove_meetup_attendee(
  p_meetup_id uuid,
  p_user_id   uuid
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_meetup public.meetups;
begin
  select * into v_meetup from public.meetups where id = p_meetup_id for update;
  if not found then raise exception 'That meetup no longer exists'; end if;
  if v_meetup.host_id <> auth.uid() and not public.is_admin() then
    raise exception 'Only the host can do that' using errcode = 'insufficient_privilege';
  end if;
  if p_user_id = v_meetup.host_id then
    raise exception 'The host cannot be removed — cancel the meetup instead';
  end if;

  -- 'declined' rather than 'left': join_meetup() lets someone who left ask
  -- again, and a removal that the removed person can immediately undo is not
  -- a removal. 'declined' is equally re-requestable, so the host also gets
  -- told if they come back, rather than them silently reappearing.
  update public.meetup_members set status = 'declined'
   where meetup_id = p_meetup_id and user_id = p_user_id
     and status in ('joined','pending');
  if not found then return false; end if;

  insert into public.notifications (user_id, kind, title, body, link)
  values (p_user_id, 'meetup_declined',
          'You were removed from ' || v_meetup.title, null, '/meetups');
  return true;
end;
$$;
revoke all    on function public.remove_meetup_attendee(uuid, uuid) from public;
grant  execute on function public.remove_meetup_attendee(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. VERIFICATION PHOTO STORAGE
-- ----------------------------------------------------------------------------
-- PRIVATE, unlike `avatars`. A verification photo is a picture of someone's
-- face taken to prove identity; it is seen by the person who uploaded it and
-- by admins reviewing the queue, and by nobody else. `public = false` means
-- reading it requires a signed URL, which only the service role can mint.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verification', 'verification', false, 4194304,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "verification: owner insert" on storage.objects;
drop policy if exists "verification: owner read"   on storage.objects;
drop policy if exists "verification: admin read"   on storage.objects;
drop policy if exists "verification: owner delete" on storage.objects;

-- Same first-folder-is-your-uid convention as avatars, so one member cannot
-- write into another's folder.
create policy "verification: owner insert" on storage.objects for insert
  with check (bucket_id = 'verification'
    and (storage.foldername(name))[1] = auth.uid()::text);
create policy "verification: owner read" on storage.objects for select
  using (bucket_id = 'verification'
    and (storage.foldername(name))[1] = auth.uid()::text);
create policy "verification: admin read" on storage.objects for select
  using (bucket_id = 'verification' and public.is_admin());
create policy "verification: owner delete" on storage.objects for delete
  using (bucket_id = 'verification'
    and (storage.foldername(name))[1] = auth.uid()::text);
