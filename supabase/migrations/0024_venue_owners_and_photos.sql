-- ============================================================================
-- 0024_venue_owners_and_photos.sql
-- Venue owner accounts, venue photo galleries, and a photo on reviews.
-- Idempotent — safe to re-run. Run after 0023.
--
-- Until now admins managed every venue. An owner role lets a bar keep its own
-- hours, description, branches and photos current, and see its own bookings,
-- without being handed the whole admin panel. Owners are appointed by admins
-- (venue_owners is admin-written) and everything they can touch is scoped by
-- is_venue_owner(slug) in RLS — never by trusting the client.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. OWNERS
-- ----------------------------------------------------------------------------
create table if not exists public.venue_owners (
  venue_slug text not null references public.venues on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (venue_slug, user_id)
);
create index if not exists venue_owners_user_idx on public.venue_owners (user_id);

alter table public.venue_owners enable row level security;
grant select on public.venue_owners to authenticated;
grant insert, delete on public.venue_owners to authenticated;

create or replace function public.is_venue_owner(p_slug text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.venue_owners vo
    where vo.venue_slug = p_slug and vo.user_id = auth.uid()
  );
$$;
revoke execute on function public.is_venue_owner(text) from public;
grant  execute on function public.is_venue_owner(text) to authenticated;

drop policy if exists "venue_owners: read own or admin" on public.venue_owners;
create policy "venue_owners: read own or admin" on public.venue_owners
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "venue_owners: admin manages" on public.venue_owners;
create policy "venue_owners: admin manages" on public.venue_owners
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Owners edit their venue. A column guard below keeps the slug fixed.
drop policy if exists "venues: owner updates" on public.venues;
create policy "venues: owner updates" on public.venues
for update to authenticated
using (public.is_venue_owner(slug)) with check (public.is_venue_owner(slug));

create or replace function public.enforce_venue_owner_update_columns()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if public.is_admin() then return new; end if;
  -- The slug is the URL and every foreign key; renaming it is an admin job.
  if new.slug is distinct from old.slug
  or new.created_at is distinct from old.created_at then
    raise exception 'That field cannot be changed'
      using errcode = 'insufficient_privilege';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists venues_owner_column_guard on public.venues;
create trigger venues_owner_column_guard
  before update on public.venues
  for each row execute function public.enforce_venue_owner_update_columns();

-- Owners manage their branches.
drop policy if exists "venue_locations: owner writes" on public.venue_locations;
create policy "venue_locations: owner writes" on public.venue_locations
for all to authenticated
using (public.is_venue_owner(venue_slug)) with check (public.is_venue_owner(venue_slug));

-- Owners see who is coming. Read only: cancelling on a member's behalf stays
-- with admins, who leave an audit trail.
drop policy if exists "bookings: owner reads" on public.bookings;
create policy "bookings: owner reads" on public.bookings
for select to authenticated
using (public.is_venue_owner(venue_slug));

-- Owners see reviews of their venue including hidden ones? No — hidden means
-- a moderator pulled it; owners see what members see.

-- ----------------------------------------------------------------------------
-- 2. VENUE PHOTOS
-- ----------------------------------------------------------------------------
create table if not exists public.venue_photos (
  id          uuid primary key default gen_random_uuid(),
  venue_slug  text not null references public.venues on delete cascade,
  uploaded_by uuid references auth.users on delete set null,
  url         text not null check (char_length(url) <= 600),
  caption     text check (char_length(caption) <= 200),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists venue_photos_venue_idx
  on public.venue_photos (venue_slug, sort_order, created_at);

alter table public.venue_photos enable row level security;
grant select on public.venue_photos to anon, authenticated;
grant insert, update, delete on public.venue_photos to authenticated;

drop policy if exists "venue_photos: public read" on public.venue_photos;
create policy "venue_photos: public read" on public.venue_photos
for select
using (exists (select 1 from public.venues v where v.slug = venue_slug and (v.is_active or public.is_admin())));

drop policy if exists "venue_photos: owner or admin writes" on public.venue_photos;
create policy "venue_photos: owner or admin writes" on public.venue_photos
for all to authenticated
using (public.is_admin() or public.is_venue_owner(venue_slug))
with check (public.is_admin() or public.is_venue_owner(venue_slug));

-- Storage: <slug>/<uuid>.<ext>. The first folder is the slug, which is what
-- the owner check keys on.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('venue-photos', 'venue-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "venue-photos: public read"   on storage.objects;
drop policy if exists "venue-photos: owner insert"  on storage.objects;
drop policy if exists "venue-photos: owner delete"  on storage.objects;
create policy "venue-photos: public read" on storage.objects for select
  using (bucket_id = 'venue-photos');
create policy "venue-photos: owner insert" on storage.objects for insert
  with check (
    bucket_id = 'venue-photos'
    and (public.is_admin() or public.is_venue_owner((storage.foldername(name))[1]))
  );
create policy "venue-photos: owner delete" on storage.objects for delete
  using (
    bucket_id = 'venue-photos'
    and (public.is_admin() or public.is_venue_owner((storage.foldername(name))[1]))
  );

-- ----------------------------------------------------------------------------
-- 3. REVIEW PHOTOS — one picture with a review
-- ----------------------------------------------------------------------------
alter table public.reviews
  add column if not exists photo_url text check (char_length(photo_url) <= 600);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('review-photos', 'review-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "review-photos: public read"  on storage.objects;
drop policy if exists "review-photos: owner insert" on storage.objects;
drop policy if exists "review-photos: owner update" on storage.objects;
drop policy if exists "review-photos: owner delete" on storage.objects;
create policy "review-photos: public read" on storage.objects for select
  using (bucket_id = 'review-photos');
create policy "review-photos: owner insert" on storage.objects for insert
  with check (bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "review-photos: owner update" on storage.objects for update
  using (bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "review-photos: owner delete" on storage.objects for delete
  using (bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text);
