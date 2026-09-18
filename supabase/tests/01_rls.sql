-- ============================================================================
-- Row-level security regression tests.
--
-- Run with:  supabase test db      (needs the Supabase CLI and Docker)
--
-- These assert the boundaries the app relies on. RLS is the authorization
-- boundary here — server functions deliberately do not filter by user_id where
-- a policy already scopes the query — so a policy regression is a data leak,
-- not a cosmetic bug. Each case below is one sentence from supabase/README.md
-- turned into an assertion.
-- ============================================================================
begin;
select plan(18);

create schema if not exists tests;
\i 00_helpers.sql

-- ---------------------------------------------------------------- fixtures --
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local',
   '{"display_name":"A","date_of_birth":"1990-01-01"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.local',
   '{"display_name":"B","date_of_birth":"1991-01-01"}'),
  ('cccccccc-0000-0000-0000-000000000003', 'admin@test.local',
   '{"display_name":"Admin","date_of_birth":"1985-01-01"}');

insert into public.venues (slug, name, description, min_age, max_age, capacity)
values ('testvenue', 'Test Venue', 'For tests', 18, 99, 20)
on conflict (slug) do nothing;

-- ============================================================ profiles ======
select tests.act_as('bbbbbbbb-0000-0000-0000-000000000002');

-- RLS does not raise on a cross-member UPDATE; it silently narrows the
-- statement to zero rows, which is the correct and quieter behaviour. So the
-- assertion is on the DATA, not on an exception — and it has to be read back
-- as an admin, because B cannot see A's row at all.
update public.profiles set display_name = 'hacked'
 where id = 'aaaaaaaa-0000-0000-0000-000000000001';

select tests.act_as_admin('cccccccc-0000-0000-0000-000000000003');
select is(
  (select display_name from public.profiles
    where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'A',
  'member B cannot change member A''s display name'
);
select tests.act_as('bbbbbbbb-0000-0000-0000-000000000002');

select ok(
  tests.refused($$update public.profiles set is_suspended = true
                  where id = 'bbbbbbbb-0000-0000-0000-000000000002'$$),
  'member cannot un-suspend or suspend themselves'
);

select ok(
  tests.refused($$update public.profiles set is_verified = true
                  where id = 'bbbbbbbb-0000-0000-0000-000000000002'$$),
  'member cannot grant themselves the verified badge (0019)'
);

select ok(
  tests.refused($$update public.profiles set date_of_birth = '2010-01-01'
                  where id = 'bbbbbbbb-0000-0000-0000-000000000002'$$),
  'member cannot change their date of birth past the age gate'
);

select is(
  (select count(*)::int from public.profiles),
  1,
  'a member reads only their own row from profiles'
);

-- ============================================================ audit_log =====
select ok(
  tests.refused($$insert into public.audit_log (actor_id, action, target_type, target_id)
                  values ('bbbbbbbb-0000-0000-0000-000000000002','forged','profile',
                          'bbbbbbbb-0000-0000-0000-000000000002')$$),
  'non-admin cannot write to the append-only audit log'
);

-- ============================================================ bookings ======
select ok(
  tests.refused($$insert into public.bookings
                  (user_id, venue_slug, booking_date, booking_time)
                  values ('bbbbbbbb-0000-0000-0000-000000000002','testvenue',
                          current_date + 1, '20:00')$$),
  'bookings cannot be inserted directly — book_venue() is the only path'
);

select ok(
  tests.refused($$select public.book_venue('testvenue', current_date - 1, '20:00', 2)$$),
  'book_venue() refuses a time that has already passed'
);

-- ============================================================ chat ==========
select ok(
  tests.refused($$insert into public.chat_messages (venue_slug, user_id, body)
                  values ('testvenue','bbbbbbbb-0000-0000-0000-000000000002','hello')$$),
  'venue chat refuses someone with no booking there'
);

-- ============================================================ connections ===
select tests.act_as('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.connections (requester_id, addressee_id, status)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        'bbbbbbbb-0000-0000-0000-000000000002', 'pending');

select tests.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select ok(
  tests.refused($$update public.connections
                  set requester_id = 'bbbbbbbb-0000-0000-0000-000000000002'
                  where addressee_id = 'bbbbbbbb-0000-0000-0000-000000000002'$$),
  'a connection response cannot rewrite requester_id'
);

update public.connections set status = 'accepted'
 where addressee_id = 'bbbbbbbb-0000-0000-0000-000000000002';
select is(
  (select status from public.connections
    where addressee_id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  'accepted',
  'the addressee can accept a pending request'
);

-- ============================================================ meetups =======
select tests.act_as('aaaaaaaa-0000-0000-0000-000000000001');
-- A connections-only meetup hosted by A. The id is looked up again below
-- rather than captured here: \gset would bind the whole composite row.
do $$ begin
  perform public.create_meetup('testvenue', current_date + 1, '20:00', 2,
    'Private plans', null, null, 'open', 'connections');
end $$;

select ok(
  tests.refused($$insert into public.meetups
                  (host_id, venue_slug, title, meet_date, meet_time, capacity)
                  values ('aaaaaaaa-0000-0000-0000-000000000001','testvenue','Direct',
                          current_date + 1, '21:00', 4)$$),
  'meetups cannot be inserted directly — create_meetup() is the only path'
);

select tests.act_as('cccccccc-0000-0000-0000-000000000003');
select is(
  (select count(*)::int from public.meetups),
  0,
  'a connections-only meetup is invisible to someone not connected to the host'
);

select ok(
  tests.refused($$select public.join_meetup(
                    (select id from public.meetups limit 1))$$),
  'and it cannot be joined by id either (visibility is checked in join_meetup)'
);

-- ============================================================ donations =====
select tests.act_as('bbbbbbbb-0000-0000-0000-000000000002');
select ok(
  tests.refused($$insert into public.donations
                  (user_id, amount_minor, currency, status)
                  values ('bbbbbbbb-0000-0000-0000-000000000002', 1000, 'EUR', 'confirmed')$$),
  'a member cannot declare their own donation already confirmed'
);

-- ============================================================ verification ==
select ok(
  tests.refused($$insert into public.verification_requests (user_id, photo_path, status)
                  values ('bbbbbbbb-0000-0000-0000-000000000002','x.jpg','approved')$$),
  'a verification request cannot be opened as already approved'
);

select ok(
  tests.refused($$select public.review_verification(gen_random_uuid(), true)$$),
  'a non-admin cannot review a verification request'
);

-- ============================================================ analytics =====
select ok(
  tests.refused($$select * from public.admin_bookings_daily(7)$$),
  'a non-admin cannot call the admin analytics functions'
);

select * from finish();
rollback;
