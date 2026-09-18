# Social Circle database

Postgres on Supabase. Row-level security is enabled on every table and is
the application's authorization boundary — the server functions in
`src/lib` rely on it rather than filtering by `user_id` themselves.

## Setting up a fresh project

Run these in the **SQL Editor**, one file at a time, in this order:

| #   | File                                       | What it does                                                                                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `migrations/0013_complete.sql`             | The whole base schema in one idempotent file: profiles, venues, venue_locations, bookings (+ `book_venue()`, `venue_availability()`, cancel-only trigger, `complete_past_bookings()` on pg_cron), favorites, reviews, blocks, chat_messages, direct_messages, reports, audit_log, donations, connections, presence_checkins, `public_profiles`, social RPCs |
| 2   | `migrations/0014_hardening.sql`            | Security + feature follow-up (see below). Safe to re-run.                                                                                                                                                                                                                                                                                                   |
| 3   | `migrations/0015_rename_social_circle.sql` | Replaces `enforce_minimum_age()` so its error text says Social Circle. Safe to re-run.                                                                                                                                                                                                                                                                      |
| 4   | `migrations/0016_admin_and_donations.sql`  | Buy Me a Coffee columns on `donations`, report targets, and the admin analytics RPCs. Safe to re-run.                                                                                                                                                                                                                                                       |
| 5   | `migrations/0017_auth_rate_limit.sql`      | Sliding-window rate limits for sign-in, sign-up and password reset. Safe to re-run.                                                                                                                                                                                                                                                                         |
| 6   | `migrations/0018_meetups.sql`              | Meetups: tables, RLS, and the create/join/approve/cancel functions. Safe to re-run.                                                                                                                                                                                                                                                                         |
| 7   | `migrations/0019_profiles_and_safety.sql`  | Bio, interests, photo verification, host removal of an attendee. Safe to re-run.                                                                                                                                                                                                                                                                            |
| 8   | `migrations/0020_web_push.sql`             | Web Push subscriptions and delivery bookkeeping. Safe to re-run.                                                                                                                                                                                                                                                                                            |
| 9   | `migrations/0021_coordinates.sql`          | lat/lng on venues and branches, for the map. Safe to re-run.                                                                                                                                                                                                                                                                                                |
| 10  | `seed/0001_venues.sql`                     | The 7 Tirana venues                                                                                                                                                                                                                                                                                                                                         |
| 11  | `seed/0002_venue_locations.sql`            | 54 branch rows (3 venues × 18 locations)                                                                                                                                                                                                                                                                                                                    |

The numbered files `0001`–`0012` are the historical, incremental versions of
what `0013` contains. You do **not** run them on a fresh project; they are
kept for the record.

`0013` through `0021` are all idempotent, so they can also be run on top of a
database that already has some of `0001`–`0012` applied.

### What 0014 changes

- `public_profiles` is now owner-executed (not `security_invoker`). Before
  this, a normal member querying the view saw only their own row, so People
  search returned nothing and every chat / DM author rendered as "Member".
- Foreign keys from `reviews` and `chat_messages` to `profiles`, and a
  `venue_rating_summary` view.
- Column-guard triggers: members can only change `display_name` and
  `avatar_url` on their profile (no more self-unsuspend or date-of-birth
  edits); connection responses can only change `status`; DMs can only be
  marked read; reviews can only change rating/comment. `audit_log` inserts
  require `is_admin()`.
- `book_venue()` rejects same-day slots already in the past (closing a
  fake-review shortcut), checks the venue's opening hours, uses a branch's
  own capacity when set, and stores `notes` + a `confirmation_code`.
  `reschedule_booking()` moves a booking atomically.
- Venue columns: `opens_at`, `closes_at`, `slot_minutes`, `address`,
  `phone`, `category`, `price_band`. Branch columns: `capacity`, `address`.
- `avatars` storage bucket (public read, owner-scoped writes, 2 MB,
  JPEG/PNG/WebP).
- `notifications` table, the triggers that fill it, and `unread_counts()`.
- Per-user rate limits enforced by triggers on `chat_messages` (20/min),
  `direct_messages` (30/min), `reports` (5/h), `connections` (20/h).
- Indexes for DM threads, audit log, member list and trigram name search;
  a unique index that stops A→B and B→A connection rows coexisting.
- `fix_missing_profile()` refuses to invent a date of birth;
  `delete_my_account()` for GDPR erasure.

### What 0016 changes

- `donations.provider` (`manual` | `buymeacoffee`) and `donations.donor_name`,
  so a Buy Me a Coffee supporter is distinguishable from a hand-recorded bank
  transfer. `provider_ref` was already UNIQUE — that is what makes webhook
  delivery idempotent, since a retried event collides instead of
  double-counting.
- `reports.target_kind` / `target_id`, so a report filed on one chat message or
  review records _what_ was reported. A CHECK requires an id for the content
  kinds (`chat_message`, `direct_message`, `review`) and allows it to be null
  for `profile` and `venue`.
- Admin analytics RPCs: `admin_bookings_daily(days)`,
  `admin_bookings_by_venue()`, `admin_members_weekly(weeks)`,
  `admin_donation_totals()` and `admin_member_stats(uuid)`. All are
  `security definer` — they aggregate across every member's rows — and each one
  calls `is_admin()` itself and raises `42501` otherwise. Date bucketing is
  pinned to `Europe/Tirane`, matching the rest of the app.

### What 0017 changes

- `auth_attempts` + `check_auth_rate(key, action, max, window)`. The rate
  limits in 0014 are triggers keyed on `auth.uid()`, which cannot work for
  sign-in, sign-up and password reset — there is no session yet and no row
  being inserted. The server calls this function before it touches Supabase
  Auth, keyed on both IP and email. RLS is on with no policy: the table is
  reachable only through the function, which is `security definer`.

### What 0018 changes

- `meetups` and `meetup_members`, plus `create_meetup()`, `join_meetup()`,
  `respond_to_join_request()` and `cancel_meetup()`.
- **The host holds the booking.** `create_meetup()` calls `book_venue()` for
  the whole party, so the venue sees one reservation for six rather than six
  for one, and capacity is counted once. Guests RSVP without a booking row.
- **Every write is an RPC.** There is no INSERT grant on either table, for the
  same reason `bookings` has no insert policy: capacity has to be checked
  under a row lock or two people take the last seat.
- `can_view_meetup()` holds the visibility rule (public / connections-only /
  blocks / existing membership) in one place. It is a `security definer`
  function rather than inline policy SQL on purpose — "can I see this meetup"
  depends on `meetup_members` and "can I see this membership" depends on
  `meetups`, and expressing both inline makes Postgres raise _infinite
  recursion detected in policy_. `join_meetup()` calls the same function, so
  visibility is enforced when joining by id, not only when listing.

### What 0019–0021 change

- **0019** — `profiles.bio`, `profiles.interests` (a curated vocabulary, GIN
  indexed for the "who shares my interests" query) and `profiles.is_verified`.
  Note that `enforce_profile_update_columns()` is a _denylist_, so new columns
  are member-editable by default; `is_verified` is added to that list, or any
  member could grant themselves the badge. Also `verification_requests` with a
  private `verification` storage bucket, and `remove_meetup_attendee()`.
- **0020** — `push_subscriptions` and `notifications.pushed_at`. Notifications
  are written by triggers, so nothing in the app sees them happen; delivery is
  a separate sweep (`/api/push-dispatch`) over the rows still unsent.
- **0021** — `lat`/`lng` on `venues` and `venue_locations`. The CHECK is
  written as `(lat is null) = (lng is null) and (…)` rather than the obvious
  `(both null) or (both in range)`: the latter evaluates to NULL for a half
  filled pair, and a CHECK treats NULL as satisfied, so half a coordinate would
  be stored.

## Tests

`supabase/tests/` holds a pgTAP suite covering the row-level security
boundaries — that a member cannot edit another's profile, self-verify,
self-suspend, write the audit log, insert a booking or meetup directly, or see
a connections-only meetup they were not invited to.

```sh
supabase test db      # needs the Supabase CLI and Docker
```

RLS is the authorization boundary in this app — the server functions
deliberately do not re-filter by `user_id` where a policy already scopes the
query — so a policy regression is a data leak rather than a cosmetic bug. That
is what the suite is for.

After running them, in **Authentication → URL Configuration** add
`https://<your-domain>/auth/callback` to the redirect allow-list.

## Verify it worked

```sql
-- Every public table must show rowsecurity = t.
select tablename, rowsecurity from pg_tables
where schemaname = 'public' order by tablename;

-- Venues + branches + the 0014 columns are present.
select count(*) venues, (select count(*) from venue_locations) branches,
       (select count(*) from information_schema.columns
         where table_name = 'venues' and column_name = 'opens_at') has_hours
from venues;

-- The cron job that completes past bookings (needed for reviews).
select jobname, schedule from cron.job where jobname = 'complete-past-bookings';

-- The avatars bucket.
select id, public, allowed_mime_types from storage.buckets where id = 'avatars';

-- 0016: the analytics RPCs exist and refuse non-admins.
select proname from pg_proc where proname like 'admin\_%' order by proname;

-- 0018: meetups are locked down to the RPCs (expect select/update only).
select grantee, privilege_type from information_schema.role_table_grants
where table_name = 'meetups' and grantee = 'authenticated';
```

## Making someone an admin

Admin is the JWT claim `app_metadata.role = 'admin'`, checked by
`is_admin()`. It is **not** interchangeable with `user_metadata`, which users
can write themselves through the client SDK. Promote from a server-side
script only (`scripts/promote-admin.mjs`, needs the service-role key). The
user must sign out and back in afterwards.

## Notes on the schema

- **Ages are dates, not buckets.** `profiles.date_of_birth` is compared with
  a venue's `min_age`/`max_age` at booking time via `age_years()`.
- **Bookings only go through `book_venue()` / `reschedule_booking()`.**
  There is no insert policy on `bookings`, and the cancel-only trigger
  restricts member updates to `confirmed → cancelled`.
- **Bookings must reach `completed` or reviews break.**
  `complete_past_bookings()` runs every 15 minutes via pg_cron; enable the
  extension in Dashboard → Database → Extensions if the migration warned.
- **Blocks are one-directional to read**, so `blocked_user_ids()` (security
  definer) exists to filter both directions in search and feeds.
- **`audit_log` is append-only** — no update or delete policy for anyone.
- **Money is stored in minor units** (`amount_minor`), never a float.
- **Capacity is per venue by default**, and per branch when
  `venue_locations.capacity` is set. Set real numbers before launch; the seed
  values are placeholders.

## Changing the age policy

One place: the `min_age` constant in `public.enforce_minimum_age()`.
Admitting 16–17s is not just that constant — it also needs guardian consent
and age-segregated direct messages, because the app pairs live per-venue
presence with private messaging.
