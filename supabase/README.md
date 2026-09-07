# NewPop database

Phase 1 of the build plan. Twelve tables, row-level security on every one of
them, seeded with the seven real venues and eighteen Tirana locations.

## Run order

Run these **in order**. Each depends on the ones before it.

| # | File | Creates |
|---|------|---------|
| 1 | `migrations/0001_foundation.sql` | Extensions, `is_admin()`, `age_years()`, `touch_updated_at()` |
| 2 | `migrations/0002_profiles.sql` | `profiles` + 18+ age rule + auto-create-on-signup trigger |
| 3 | `migrations/0003_venues.sql` | `venues`, `venue_locations` |
| 4 | `migrations/0004_bookings.sql` | `bookings` + `book_venue()` + `venue_availability()` |
| 5 | `migrations/0005_engagement.sql` | `favorites`, `reviews` |
| 6 | `migrations/0006_messaging.sql` | `blocks`, `chat_messages`, `direct_messages` |
| 7 | `migrations/0007_moderation.sql` | `reports`, `audit_log` |
| 8 | `migrations/0008_donations.sql` | `donations` |
| 9 | `migrations/0009_booking_completion.sql` | `complete_past_bookings()` + its pg_cron schedule |
| 10 | `seed/0001_venues.sql` | The 7 venues |
| 11 | `seed/0002_venue_locations.sql` | 54 branch rows (3 venues x 18 locations) |

### Option A — Supabase SQL Editor

Open your project → **SQL Editor** → paste each file's contents → **Run**.
One file at a time, top to bottom. Stop if any errors.

### Option B — Supabase CLI

```sh
supabase link --project-ref <your-project-ref>
supabase db push                                  # runs migrations/
psql "$DATABASE_URL" -f supabase/seed/0001_venues.sql
psql "$DATABASE_URL" -f supabase/seed/0002_venue_locations.sql
```

The seed files are idempotent — re-running them updates rows in place rather
than failing, so you can edit values and re-run.

## Verify it worked

```sql
-- 12 tables, every one with RLS enabled. Any 'f' here is a security hole.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- Should be 7 venues and 54 branches.
select (select count(*) from venues) as venues,
       (select count(*) from venue_locations) as branches;
```

## Making someone an admin

Admin is a JWT claim in **`app_metadata`**, checked by `is_admin()`.

This is not interchangeable with `user_metadata`. `user_metadata` is writable
by the user through the client SDK, so a role stored there can be self-granted
— a normal account could set `is_admin: true` on itself and read every
booking, report, and private message in the database. `app_metadata` can only
be written with the service-role key.

Promote a user from a **server-side** script only:

```js
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY   // never ship this to the browser
);

await admin.auth.admin.updateUserById(userId, {
  app_metadata: { role: "admin" },        // app_metadata, not user_metadata
});
```

The user must sign out and back in afterwards — the claim is baked into the
JWT at issue time, so an existing session keeps its old one until refresh.

**Never hardcode an admin password in a committed file.** The
`scripts/seed-admin.mjs` on the `v0/supabase-auth-login` branch contains a
literal password in a public repository; if that script has been run against a
live project, change that account's password.

## Notes on the schema

- **Ages are dates, not buckets.** `profiles.date_of_birth` replaces the
  prototype's `ageRange` string. The four registration buckets (`18-24`,
  `25-30`, …) could never be compared against a venue's `min_age`, and a
  stored bucket goes stale as the user ages. Every bucket is now derived.
- **Bookings only go through `book_venue()`.** There is deliberately no insert
  policy on `bookings`, so the client SDK cannot write the table directly and
  bypass capacity or age checks. The function takes a row lock on the venue
  before counting seats, which is what makes it safe under concurrent load.
- **Bookings must reach `completed` or reviews break.** `0009` adds
  `complete_past_bookings()` and schedules it every 15 minutes via pg_cron.
  Without it nothing ever sets `status = 'completed'`, so the
  "reviews: write own after visiting" policy in `0005` can never be
  satisfied and every review insert is rejected. **pg_cron must be enabled**
  (Dashboard > Database > Extensions); the migration raises a warning rather
  than failing the whole file if it is not.
- **Blocking ships with messaging**, in the same migration, not as a
  follow-up.
- **`audit_log` is append-only** — no update or delete policy exists for
  anyone, admins included.
- **Money is stored in minor units** (`amount_minor` bigint), never a float.

## Changing the age policy

One place: the `min_age` constant in `public.enforce_minimum_age()` in
`migrations/0002_profiles.sql`. Admitting 16–17s is *not* just that constant —
it also needs a guardian-consent table and age-segregated direct messages,
because the app pairs a live per-venue age breakdown with private messaging.
