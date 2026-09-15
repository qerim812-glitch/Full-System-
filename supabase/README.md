# NewPop database

Postgres on Supabase. Row-level security is enabled on every table and is
the application's authorization boundary — the server functions in
`src/lib` rely on it rather than filtering by `user_id` themselves.

## Setting up a fresh project

Run these in the **SQL Editor**, one file at a time, in this order:

| #   | File                            | What it does                                                                                                                                                                                                                                                                                                                                                |
| --- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `migrations/0013_complete.sql`  | The whole base schema in one idempotent file: profiles, venues, venue_locations, bookings (+ `book_venue()`, `venue_availability()`, cancel-only trigger, `complete_past_bookings()` on pg_cron), favorites, reviews, blocks, chat_messages, direct_messages, reports, audit_log, donations, connections, presence_checkins, `public_profiles`, social RPCs |
| 2   | `migrations/0014_hardening.sql` | Security + feature follow-up (see below). Safe to re-run.                                                                                                                                                                                                                                                                                                   |
| 3   | `seed/0001_venues.sql`          | The 7 Tirana venues                                                                                                                                                                                                                                                                                                                                         |
| 4   | `seed/0002_venue_locations.sql` | 54 branch rows (3 venues × 18 locations)                                                                                                                                                                                                                                                                                                                    |

The numbered files `0001`–`0012` are the historical, incremental versions of
what `0013` contains. You do **not** run them on a fresh project; they are
kept for the record.

`0013` and `0014` are both idempotent, so they can also be run on top of a
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

After running it, in **Authentication → URL Configuration** add
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
