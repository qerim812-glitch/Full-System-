# NewPop — next steps

Continuation plan after the 16 Sep 2026 audit pass. Everything in
`docs/AUDIT-2026-09-16.md` marked ✅ is live; this file is the ordered list
of what comes next, what each item needs, and how to pick up the work.

## Where things stand

- `main` is at `79eeba0` and deployed. Working tree clean.
- Migration `0014_hardening.sql` is applied on the live Supabase project.
- `/auth/callback` is in the Supabase Auth redirect allow-list.
- Checks that must stay green before every push:
  `bunx tsc --noEmit` · `bun run lint` · `bun run test` · `bun run build`.
- Use Homebrew git on the dev Mac (`/opt/homebrew/bin/git`) if the system
  git asks for the Xcode licence again.
- New schema changes go in `supabase/migrations/0015_*.sql`. Never edit 0013
  or 0014 once applied.

## Session 1 — localisation + realtime (~half a day, no external inputs)

### 1. Albanian localisation

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

## Session 2 — hardening (~3 hours)

### 3. Auth rate limiting

- Option A (preferred): Upstash Redis + `@upstash/ratelimit` in
  `signIn`, `signUp`, `requestPasswordReset`, keyed on `x-forwarded-for`
  - email. **Needs:** Upstash account, two env vars.
- Option B (no account): DB table `auth_attempts(key, at)` + a
  `security definer` function `check_auth_rate(key, max, window)` called
  from the same three server functions.

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

### 8. Donations via Stripe

- Stripe Checkout session created by a server function; webhook route
  (`src/routes/api/stripe-webhook.ts`) verifies the signature and flips
  `donations.status` pending → confirmed using `provider_ref`.
- Remove manual admin confirmation once live. **Needs:** Stripe account,
  publishable + secret + webhook secret env vars.

### 9. Admin charts + report deep links

- Bookings per day / per venue and members joined per week using the
  existing `components/ui/chart.tsx` (Recharts).
- `reports.target_kind` + `target_id` (0015) so the ReportDialog on a chat
  message or review records what was reported, and the admin queue links
  to it in the Moderation tab.

## Backlog (no session assigned)

- Waitlist for full slots (table + notify when a seat frees up).
- Review photos (Storage bucket `review-photos`, max 3 per review).
- Venue owner accounts and replies to reviews.
- Social login (Google / Apple) — needs OAuth app credentials.
- Split `src/routes/_authed/admin.tsx` into `src/features/admin/*`.
- Delete unused shadcn files (`sidebar`, `chart`*, `calendar`, `tabs`,
  `use-mobile`) — *keep `chart` if item 9 goes ahead.
- Service worker / offline shell for the PWA.

## How to resume

1. `bun install`, copy `.env` if on a new machine, `bun run dev`.
2. Read `docs/AUDIT-2026-09-16.md` §3 and §8 for context on the open items.
3. Pick the next session above, create the migration if needed, run the
   four checks, commit with a conventional message, push to `main`.
