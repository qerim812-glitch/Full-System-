-- ============================================================================
-- seed/0001_venues.sql
-- The seven real venues, lifted from the `destinations[]` array at the top of
-- public/app.js. Run AFTER all migrations.
--
-- Idempotent: re-running updates rows in place rather than failing, so you
-- can edit values here and re-run this file as the single source of truth.
--
-- TWO DELIBERATE CHANGES FROM THE PROTOTYPE DATA:
--
--   1. Mulliri's min_age was 16. Raised to 18 to match the 18+ policy in
--      migration 0002 and the registration form's own lowest age bucket.
--      (The prototype could never register a 16-year-old anyway.)
--
--   2. The slug was misspelled 'le-cheateau' in app.js. Corrected to
--      'le-chateau' here, while nothing yet depends on it — slugs end up in
--      URLs, where a typo is permanent.
--
-- CAPACITY VALUES ARE PLACEHOLDERS. The prototype had no capacity concept,
-- only a decorative `activeCount`. Replace these with real seating limits
-- before launch: they are what book_venue() enforces.
-- ============================================================================

insert into public.venues
  (slug, name, description, image_url, location_url, min_age, max_age, capacity)
values
  (
    'mulliri',
    'Mulliri',
    'Popular coffee hub in Tirana, perfect for remote working, fresh pastries, and social meetups.',
    'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=600&q=80',
    'https://maps.google.com/?q=Mulliri+Tirane+Albania',
    18, 60, 60
  ),
  (
    'moncherie',
    'Moncherie',
    'Cozy, vibrant espresso bar franchise loved by students and young professionals across Tirana.',
    'https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=600&q=80',
    'https://maps.google.com/?q=MonCherie+Tirane+Albania',
    18, 35, 45
  ),
  (
    'sophie',
    'Sophie',
    'Charming lounge bar and caffe offer sweet treats and vibrant social atmospheres.',
    'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=600&q=80',
    'https://maps.google.com/?q=Sophie+Caffe+Tirane+Albania',
    18, 45, 40
  ),
  (
    'le-chateau',
    'Le Chateau',
    'Elegant lounge environment featuring fine drinks, signature cocktails, and relaxed vibes.',
    'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=600&q=80',
    'https://maps.google.com/?q=Le+Chateau+Tirane+Albania',
    21, 65, 70
  ),
  (
    'millenium-garden',
    'Millenium Garden',
    'Spacious outdoor terrace garden bar along Pedonalja, ideal for large gatherings.',
    'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/2f/3f/36/d5/caption.jpg?w=900&h=-1&s=1',
    'https://maps.google.com/?q=Millennium+Garden+Tirane+Albania',
    18, 70, 90
  ),
  (
    'my-way',
    'My Way - Liqeni Artificial Tirane',
    'Scenic bar right by Tirana Artificial Lake, offering panoramic water views and great cocktails.',
    'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=600&q=80',
    'https://maps.google.com/?q=My+Way+Liqeni+Artificial+Tirane+Albania',
    20, 50, 80
  ),
  (
    'komiteti',
    'Komiteti',
    'Famous Kafe-Muzeum known for vintage Albanian culture, traditional raki, and artistic community.',
    'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=600&q=80',
    'https://maps.google.com/?q=Komiteti+Kafe+Muzeum+Tirane+Albania',
    21, 55, 65
  )
on conflict (slug) do update set
  name         = excluded.name,
  description  = excluded.description,
  image_url    = excluded.image_url,
  location_url = excluded.location_url,
  min_age      = excluded.min_age,
  max_age      = excluded.max_age,
  capacity     = excluded.capacity,
  updated_at   = now();

select slug, name, min_age, max_age, capacity from public.venues order by slug;
