-- ============================================================================
-- 0003_venues.sql
-- Venues and their city branches. Replaces the `destinations[]` and
-- `barLocationsList[]` arrays hardcoded at the top of public/app.js.
-- ============================================================================

create table public.venues (
  slug          text primary key,
  name          text not null,
  description   text not null,
  image_url     text,
  location_url  text,
  min_age       integer not null check (min_age >= 18),
  max_age       integer not null,
  -- Real seating limit, enforced on booking. The prototype's `activeCount`
  -- and `totalBookings` were decorative constants; occupancy is now derived
  -- from the bookings table instead.
  capacity      integer not null check (capacity > 0),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint venues_age_range_valid check (max_age >= min_age)
);

create trigger venues_touch_updated_at
  before update on public.venues
  for each row execute function public.touch_updated_at();

-- Branches. In the prototype a single global `barLocationsList` was shown for
-- any venue with `hasLocationsDropdown: true`, so branches are modelled per
-- venue and seeded only for those three.
create table public.venue_locations (
  id          uuid primary key default gen_random_uuid(),
  venue_slug  text not null references public.venues on delete cascade,
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (venue_slug, name)
);

create index venue_locations_venue_idx on public.venue_locations (venue_slug);

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Venues are the one genuinely public catalogue: anonymous visitors must be
-- able to browse them before signing up. Writes stay admin-only.
-- ---------------------------------------------------------------------------
alter table public.venues enable row level security;
alter table public.venue_locations enable row level security;

create policy "venues: public read active"
  on public.venues for select
  using (is_active or public.is_admin());

create policy "venues: admin writes"
  on public.venues for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "venue_locations: public read active"
  on public.venue_locations for select
  using (is_active or public.is_admin());

create policy "venue_locations: admin writes"
  on public.venue_locations for all
  using (public.is_admin())
  with check (public.is_admin());
