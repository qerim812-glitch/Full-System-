# Social Circle — next steps

Continuation plan after the 16 Sep 2026 audit pass. Everything in
`docs/AUDIT-2026-09-16.md` marked ✅ is live; this file is the ordered list
of what comes next, what each item needs, and how to pick up the work.

## Where things stand

- Migration `0014_hardening.sql` is applied on the live Supabase project.
- **Not yet applied:** `0015` through `0021`. Run them in order in the SQL
  editor before deploying the current `main`. Without them the admin Dashboard
  and Reviews tabs error, donations cannot be recorded, rate limiting fails
  open, and /meetups, /feed, verification and the map are all broken.
- **Enable Realtime** on `chat_messages`, `direct_messages` and
  `notifications` (Database → Replication). Optional — the app polls until you
  do — but it is the difference between instant and five seconds.
- Before launch, fill in the placeholders in `src/lib/legal.ts` — they appear
  verbatim on the public policy pages.
- `/auth/callback` is in the Supabase Auth redirect allow-list.
- Checks that must stay green before every push:
  `bunx tsc --noEmit` · `bun run lint` · `bun run test` · `bun run build`.
- Use Homebrew git on the dev Mac (`/opt/homebrew/bin/git`) if the system
  git asks for the Xcode licence again.
- New schema changes go in `supabase/migrations/0022_*.sql`. Never edit a
  migration once it is applied.

## Session 1 — localisation + realtime

### 1. Albanian localisation — ✅ infrastructure done, extraction partial

Built **without** i18next. The reason is concrete rather than preference:
i18next holds the active language on one module-level instance, and this app
renders on the server where several requests are in flight at once — one
mutable global language is a race that renders request A in request B's
language. The locale is passed through React context instead
(`src/i18n/index.tsx`), read server-side from a cookie so SSR, `<html lang>`
and the browser agree from the first byte.

Done: both catalogues, the `sq`/`en` toggle in the header and on the auth
screens, and a test asserting the catalogues have identical keys **and
identical `{{placeholders}}`** — a translator dropping `{{count}}` would
otherwise ship "left" with no number.

**Still to do — and this is the honest part.** Only the app shell, auth
screens, footer, feed and meetup surfaces are translated. Page bodies, form
labels, toasts, Zod messages and the whole admin panel are still English.
Extending it is mechanical: add the key to both JSON files, call `useT()`.

- **You provide:** a native proof-read. The Albanian is mine, not a
  translator's, and it should be checked before launch.

### 1b. Original plan (superseded)

- Add `react-i18next` + `i18next`. Default locale `sq`, fallback `en`.
- `src/i18n/sq.json`, `src/i18n/en.json`; a `useT()` hook; a language pill
  in the header next to the theme toggle, persisted like the theme.
- Extract strings route by route: auth → venues → bookings → people →
  messages → account → admin. Zod error messages too (`src/lib/*.ts`).
- `<html lang>` follows the active locale (`__root.tsx`); `pageHead()` in
  `src/lib/seo.ts` takes translated titles.
- **You provide:** a proof-read of the Albanian copy once the JSON exists.

### 2. Realtime for chat, DMs and notifications

- Server function `getRealtimeToken()` in `src/lib/auth.ts` that returns the
  current session's access token (short-lived; browser never sees the
  refresh token or cookie).
- In `src/lib/supabase/browser.ts`, call `supabase.realtime.setAuth(token)`
  before subscribing; refresh the token on `TOKEN_REFRESHED`-equivalent
  interval (~50 min).
- Subscribe to `postgres_changes` on `direct_messages` (thread page + header
  badge), `chat_messages` (VenueChat), `notifications` (bell). Remove the
  5 s / 30 s polling in `VenueChat.tsx`, `messages_.$userId.tsx`,
  `_authed.tsx`.
- **You provide:** enable Realtime on those three tables in Supabase
  (Database → Replication → supabase_realtime publication).

## Session 2 — hardening

### 3. Auth rate limiting — ✅ done

Option B, as planned: `auth_attempts` + `check_auth_rate()` in migration 0017,
called from `signIn`, `signUp` and `requestPasswordReset` via
`src/lib/rate-limit.ts`. Keyed on IP **and** email, both checked. Fails open
if the function errors — a broken limiter must not take sign-in down with it.
No Upstash account needed.

### 4. pgTAP RLS tests

- `supabase/tests/*.sql` with pgTAP: "member B cannot update member A's
  profile", "member cannot set is_suspended", "member cannot rewrite
  requester_id on a connection", "non-admin cannot insert audit_log",
  "chat insert without booking fails", "booking past time fails".
- Run with `supabase test db` locally. **Needs:** Supabase CLI + Docker.

### 5. Per-request user cache

- Wrap `getCurrentUser()` in `src/lib/supabase/server.ts` with
  `AsyncLocalStorage` (or the request event context) so a mutating request
  verifies the JWT once, not twice.

## Session 3 — venue data + map (~3 hours + your data)

### 6. Coordinates + map view

- `0015`: `venues.lat/lng`, `venue_locations.lat/lng` (numeric(9,6)).
- MapLibre GL (free tiles from OpenFreeMap or MapTiler) on `/venues`
  (toggle list ↔ map) and on the venue detail page (branches as pins).
- Admin venue/branch forms get lat/lng fields with a "pick on map" helper.
- **You provide:** coordinates (or addresses to geocode) for the 7 venues
  and 54 branches, and the real seating capacity per branch.

### 7. Real capacities

- Replace placeholder `capacity` values in `seed/0001_venues.sql` and set
  `venue_locations.capacity` via the admin Branches panel.

## Session 4 — payments + admin polish (~4 hours + Stripe)

### 8. Donations — ✅ done via Buy Me a Coffee, not Stripe

Shipped instead of the Stripe plan: BMC needs no PCI surface and no merchant
onboarding. `/donate` leads with the BMC button, the manual ledger stays
collapsed underneath for bank transfers, and `/api/bmc-webhook` records
supporters automatically (HMAC-verified, idempotent on `provider_ref`).

Still open here:

- Confirm the `data` field names from a real BMC test event and trim the
  candidate list in `src/lib/buymeacoffee.ts` to what BMC actually sends.
- Decide whether recurring BMC memberships should be recorded. They are
  acknowledged and ignored today — `donations` models one-off payments.
- Stripe remains the answer only if card payments need to happen on-site
  rather than on BMC's page.

### 9. Admin dashboard — ✅ done

Dashboard charts, a Reviews tab, member drill-down (admin role, GDPR delete),
report deep links showing the reported content inline, and CSV export on every
table. Still open:

- `src/routes/_authed/admin.tsx` is still ~1600 lines even after the new
  panels moved to `src/components/admin/`. The Venues, Locations, Bookings and
  Moderation panels should follow them.
- Force sign-out is deliberately absent: GoTrue exposes no "revoke by user id"
  and supabase-js only offers `signOut(jwt)`. Suspension is enforced in RLS, so
  it takes effect on the next query regardless of an open session.

## Shipped since — phases 1 to 7

Everything below is done, on `main`, with the four checks green.

### Profiles and discovery (0019)

`bio` and a curated `interests` vocabulary, GIN indexed so "who shares my
interests" is an array-overlap query rather than a scan. `/feed` is the new
signed-in home: meetups tonight, where connections have checked in, and
suggested people ranked by shared interests.

### Safety (0019)

Photo verification — a member uploads to a **private** bucket, an admin
compares it with their avatar through a 10-minute signed URL, and a badge is
set. The badge claims only "a moderator looked at this", which is all it can
honestly claim. Plus host-removes-attendee, and share-my-plans, which uses the
Web Share sheet so a friend gets the venue and time in their own messaging app.

### Realtime and Web Push (0020)

`useRealtime` subscribes to `postgres_changes` with a short-lived access token
from `getRealtimeToken()` — the websocket cannot read the httpOnly cookie, and
an anonymous socket silently delivers nothing because RLS filters it all out.
It **keeps polling until the channel reports SUBSCRIBED**, so a deployment that
never enables Realtime behaves exactly as before rather than breaking.

Web Push is gated behind VAPID keys and a dispatcher secret that fails closed.

### pgTAP (supabase/tests/)

18 assertions over the RLS boundaries. Run with `supabase test db`.

### Map (0021)

MapLibre with OpenFreeMap tiles — no API key, no billing relationship. Loaded
by dynamic import because most visits never open it. Admin venue and branch
forms take lat/lng.

- **You provide:** coordinates for the 7 venues and 54 branches. Until then the
  map shows an empty state; nothing else is blocked.

### Admin split

`src/routes/_authed/admin.tsx` went from 1638 lines to 456; the nine panels now
live in `src/components/admin/`.

## Shipped earlier — launch blockers and meetups

### Launch blockers — ✅ done

- **Legal**: public `/privacy`, `/terms` and `/guidelines`, written against the
  real schema, linked from the footer, the auth screens and sign-up.
  Placeholders in `src/lib/legal.ts` still need filling in.
- **SEO**: `og-image.png` (1200×630, generated from the brand colours),
  absolute OG tags, `/robots.txt` and `/sitemap.xml` served from routes so the
  `Sitemap:` line and `<loc>` are absolute.
- **Error monitoring**: `src/lib/monitoring.ts`, Sentry behind
  `VITE_SENTRY_DSN`, loaded by dynamic import so it costs nothing when unset.
  PII scrubbed — no cookies, no bodies, user id only.
- **Rate limiting**: see session 2 above.

### Meetups — ✅ done

Migration 0018 plus `src/lib/meetups.ts`, `/meetups` and `/meetups/$meetupId`.
Host books the table for the party; guests RSVP. Join policy and visibility are
per meetup. Validated against a real Postgres — that pass caught three bugs
worth remembering:

1. Two RLS policies referencing each other's tables → _infinite recursion
   detected in policy_. Fixed with the `can_view_meetup()` definer function,
   which is now the single home of the visibility rule.
2. `SELECT count(*) INTO` resets `FOUND`, so a later `if found` took the wrong
   branch and `join_meetup()` reported success while inserting nothing.
   Existence is captured in an explicit variable now.
3. Visibility was enforced only in the SELECT policy, so a connections-only
   meetup was hidden but still joinable by anyone holding its id.
   `join_meetup()` calls `can_view_meetup()` itself.

Still open on meetups:

- **Per-meetup chat.** Attendees can DM each other and the venue chat exists,
  but a meetup has no thread of its own. Closest next step: a `meetup_messages`
  table mirroring `chat_messages`, reusing `VenueChat`'s component shape.
- Reminder notification before it starts (needs pg_cron, like
  `complete_past_bookings`).
- The host cannot edit a meetup after creating it, only cancel it.
- Capacity is booked up front, so a meetup that fills only half its seats still
  holds the whole table. Shrinking the booking as it approaches would need a
  `reschedule_booking()`-style party-size change.

## Backlog (no session assigned)

- Waitlist for full slots (table + notify when a seat frees up).
- Server-side search/pagination for the Bookings, Moderation and Audit panels —
  Members and Reviews now query the database, the others still filter whatever
  rows happen to be loaded.
- Review photos (Storage bucket `review-photos`, max 3 per review).
- Venue owner accounts and replies to reviews.
- Social login (Google / Apple) — needs OAuth app credentials.
- Split `src/routes/_authed/admin.tsx` into `src/features/admin/*`.
- Delete unused shadcn files (`sidebar`, `calendar`, `tabs`, `use-mobile`).
  `chart` is now in use by the admin Dashboard — keep it.
- Service worker / offline shell for the PWA.

## How to resume

1. `bun install`, copy `.env` if on a new machine, `bun run dev`.
2. Read `docs/AUDIT-2026-09-16.md` §3 and §8 for context on the open items.
3. Pick the next session above, create the migration if needed, run the
   four checks, commit with a conventional message, push to `main`.
