# NewPop

Book a table at cafés, lounges and bars across Tirana, see which of your
connections are going out tonight, and chat with the people who booked the
same place. 18+ only.

**Stack:** TanStack Start (React 19, file-based routes, server functions) ·
Supabase (Postgres, Auth, Storage, row-level security) · Tailwind 4 + shadcn ·
Vitest · Bun · deployed to Vercel via nitro.

## Features

| Area          | What members get                                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Venues        | Public landing page, list with search / sort / category / capacity / age filters, detail page with rating, hours, address, branches                                            |
| Booking       | Per-venue time slots with live seats-left, branch choice, party size, special requests, confirmation code, add-to-calendar (.ics), atomic reschedule, cancel with confirmation |
| Reviews       | One review per venue after a completed visit; author names and avatars; admin hide/unhide                                                                                      |
| Social        | Connection requests (sent / incoming / connected), member profile pages, "who's going" check-ins per venue and date, mutual connections                                        |
| Messaging     | Direct messages, per-venue chat for guests with a booking, block / unblock, report                                                                                             |
| Notifications | In-app bell: connection requests and accepts, connections' check-ins, admin booking changes, review moderation, post-visit "leave a review"                                    |
| Account       | Avatar upload, display name, password change, password reset by email, GDPR export and account deletion, blocked list, dark mode                                               |
| Admin         | Reports queue, donations, bookings (+ CSV export), venues and branches CRUD, members (suspend), moderation feed, append-only audit log                                         |

## Local development

```sh
bun install
cp .env.example .env          # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
bun run dev                   # http://localhost:3000
```

Checks that must stay green before a commit:

```sh
bunx tsc --noEmit
bun run lint
bun run test
bun run build
```

## Database setup

See [`supabase/README.md`](supabase/README.md). Short version, for a fresh
project: run `supabase/migrations/0013_complete.sql`, then
`0014_hardening.sql`, then the two seed files, in the Supabase SQL editor.

Then in **Authentication → URL Configuration** add
`https://<your-domain>/auth/callback` (and your Vercel preview pattern) to
the redirect allow-list — the sign-up confirmation and password-reset emails
land there.

## Making an admin

Admin is `app_metadata.role = 'admin'` on the auth user (never
`user_metadata`, which users can write themselves). Use the server-side
script with the service-role key:

```sh
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/promote-admin.mjs <user-email>
```

The user must sign out and back in for the new claim to take effect.

## Project layout

```
src/
  routes/            file-based routes (TanStack Start). _authed.tsx is the app shell.
  routes/_authed/    every signed-in page
  components/        shared UI (StatChip, PillTabs, Avatar, ConfirmButton, VenueCard, …)
  components/venue/  booking form, slot picker, review list, who's-going panel
  components/ui/     shadcn primitives
  lib/               server functions (createServerFn) + pure helpers, one file per domain
  lib/__tests__/     Vitest unit tests for the pure helpers and schemas
  hooks/             useTheme
supabase/
  migrations/        0013_complete.sql is the canonical schema; 0014 hardens it
  seed/              the Tirana venues and branches
docs/
  AUDIT-2026-09-16.md   full audit, findings and roadmap
```

### Conventions

- Server functions live in `src/lib/*.ts`, rely on RLS as the authorization
  boundary (no `user_id` filters where a policy already scopes the query),
  and return `{ ok: true, … } | { ok: false, error }` instead of throwing for
  user-actionable failures.
- Never write to `bookings` directly: `book_venue()` and
  `reschedule_booking()` are the only paths and they enforce capacity, hours,
  age limits and past-time checks under a row lock.
- Dates shown to users go through `formatDate` / `formatBookingDate` /
  `formatRelative` in `src/lib/utils.ts` (locale and Europe/Tirane pinned, so
  SSR and browser output match).
- Session cookies are `httpOnly`. Anything that needs the session (uploads,
  password changes, realtime tokens) runs in a server function.
- The repo is connected to Lovable: never force-push, rebase or amend
  commits that are already on `main`.

## Roadmap

The prioritised list, with what is done and what is next, is in
[`docs/AUDIT-2026-09-16.md`](docs/AUDIT-2026-09-16.md). Headline items still
open: Albanian localisation, Supabase Realtime for chat/DMs (needs a token
bridge), a map view, payment provider integration for donations, and pgTAP
RLS tests.
