-- ============================================================================
-- seed/0002_venue_locations.sql
-- The eighteen Tirana branch locations, from `barLocationsList[]` in
-- public/app.js. Run AFTER seed/0001_venues.sql.
--
-- In the prototype a single global list was shown for any venue whose
-- `hasLocationsDropdown` was true — Mulliri, Moncherie, and Sophie. The other
-- four are single-site venues and get no branches, which is why this is a
-- cross join over exactly those three slugs (3 x 18 = 54 rows).
--
-- Idempotent via the (venue_slug, name) unique constraint.
-- ============================================================================

insert into public.venue_locations (venue_slug, name)
select v.slug, l.name
from (values
    ('mulliri'),
    ('moncherie'),
    ('sophie')
  ) as v(slug)
cross join (values
    ('bllok'),
    ('drejtoria e policise'),
    ('sheshi wilson'),
    ('blv bajram curri'),
    ('rruga jan kukuzeli'),
    ('rruga sami frasheri'),
    ('rruga medar shtylla'),
    ('zogu i zi'),
    ('rruga muhamet gjollesha'),
    ('rruga e kavajes'),
    ('toptani'),
    ('rruga e elbasanit'),
    ('rruga e durresit'),
    ('rruga e barikadave'),
    ('don bosco'),
    ('ali demi'),
    ('rruga hoxha tasim'),
    ('kombinat')
  ) as l(name)
on conflict (venue_slug, name) do nothing;

select venue_slug, count(*) as branches
from public.venue_locations
group by venue_slug
order by venue_slug;
