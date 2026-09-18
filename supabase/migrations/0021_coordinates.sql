-- ============================================================================
-- 0021_coordinates.sql
-- Latitude / longitude for venues and their branches, for the map view.
-- Idempotent — safe to re-run. Run after 0020.
--
-- numeric(9,6) rather than double precision: six decimal places is about 11 cm,
-- far beyond what is needed to drop a pin on a café, and an exact decimal type
-- means a coordinate typed into the admin form reads back as the same string
-- it was entered as. PostGIS would be the answer for "venues within 500 m of
-- me"; nothing here asks that question yet, and a geography column plus its
-- extension is a lot of machinery for a pin.
-- ============================================================================

alter table public.venues
  add column if not exists lat numeric(9,6),
  add column if not exists lng numeric(9,6);

alter table public.venue_locations
  add column if not exists lat numeric(9,6),
  add column if not exists lng numeric(9,6);

-- Range checks, and both-or-neither.
--
-- The `(lat is null) = (lng is null)` clause is not decoration. Written the
-- obvious way —
--     (lat is null and lng is null) or (lat between ... and lng between ...)
-- — a row with a latitude and a NULL longitude evaluates to
-- `false OR (true AND NULL)` = NULL, and a CHECK constraint treats NULL as
-- satisfied. Half a coordinate pair would be stored and the map would try to
-- place a pin at an undefined longitude. `IS NULL` always yields a real
-- boolean, so comparing the two closes that hole.
--
-- A transposed pair (lat 19.8, lng 41.3) is still in range and still wrong;
-- no constraint can catch that, which is why the admin form links out to a
-- map to check the pin.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'venues_latlng_range') then
    alter table public.venues add constraint venues_latlng_range check (
      (lat is null) = (lng is null)
      and (lat is null or (lat between -90 and 90 and lng between -180 and 180))
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'venue_locations_latlng_range') then
    alter table public.venue_locations add constraint venue_locations_latlng_range check (
      (lat is null) = (lng is null)
      and (lat is null or (lat between -90 and 90 and lng between -180 and 180))
    );
  end if;
end; $$;

comment on column public.venues.lat is
  'Latitude, WGS84. NULL until someone fills it in — the map simply omits venues without coordinates.';

-- Partial index: the map only ever asks for the rows that have coordinates.
create index if not exists venues_located_idx
  on public.venues (slug) where lat is not null;
create index if not exists venue_locations_located_idx
  on public.venue_locations (venue_slug) where lat is not null;
