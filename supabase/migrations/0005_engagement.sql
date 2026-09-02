-- ============================================================================
-- 0005_engagement.sql
-- Favourites and reviews. Replaces the socialCircleFavorites and
-- socialCircleReviews localStorage keys.
-- ============================================================================

create table public.favorites (
  user_id     uuid not null references auth.users on delete cascade,
  venue_slug  text not null references public.venues on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, venue_slug)
);

alter table public.favorites enable row level security;

create policy "favorites: manage own"
  on public.favorites for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------

create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  venue_slug  text not null references public.venues on delete cascade,
  rating      integer not null check (rating between 1 and 5),
  comment     text check (char_length(comment) <= 2000),
  is_hidden   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- One review per person per venue; editing replaces it.
  unique (user_id, venue_slug)
);

create index reviews_venue_idx on public.reviews (venue_slug, created_at desc)
  where is_hidden = false;

create trigger reviews_touch_updated_at
  before update on public.reviews
  for each row execute function public.touch_updated_at();

alter table public.reviews enable row level security;

-- Reviews are public content: anyone browsing a venue reads them.
create policy "reviews: public read visible"
  on public.reviews for select
  using (is_hidden = false or auth.uid() = user_id or public.is_admin());

-- Only after actually visiting. A review from someone who never booked is
-- the cheapest form of fake review, so the policy requires a completed
-- booking at that venue.
create policy "reviews: write own after visiting"
  on public.reviews for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.bookings b
       where b.user_id    = auth.uid()
         and b.venue_slug = reviews.venue_slug
         and b.status     = 'completed'
    )
  );

create policy "reviews: update own"
  on public.reviews for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "reviews: delete own"
  on public.reviews for delete
  using (auth.uid() = user_id);

create policy "reviews: admin moderates"
  on public.reviews for all
  using (public.is_admin())
  with check (public.is_admin());
