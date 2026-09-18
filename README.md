# Social Circle

Book a table at cafés, lounges and bars across Tirana, see which of your
connections are going out tonight, and chat with the people who booked the
same place. 18+ only.

**Stack:** TanStack Start (React 19, file-based routes, server functions) ·
Supabase (Postgres, Auth, Storage, row-level security) · Tailwind 4 + shadcn ·
Vitest · Bun · deployed to Vercel via nitro.

## Features

| Area          | What members get                                                                                                                                                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Venues        | Public landing page, list with search / sort / category / capacity / age filters, detail page with rating, hours, address, branches                                                                                                                         |
| Booking       | Per-venue time slots with live seats-left, branch choice, party size, special requests, confirmation code, add-to-calendar (.ics), atomic reschedule, cancel with confirmation                                                                              |
| Reviews       | One review per venue after a completed visit; author names and avatars; admin hide/unhide                                                                                                                                                                   |
| Meetups       | Host a meetup — books the table for the whole party in one reservation; guests RSVP. Per-meetup join policy (open / host approves / connections-only) and visibility (public / connections). Capacity, venue age limits and blocks enforced in the database |
| Social        | Connection requests (sent / incoming / connected), member profile pages, "who's going" check-ins per venue and date, mutual connections                                                                                                                     |
| Messaging     | Direct messages, per-venue chat for guests with a booking, block / unblock, report                                                                                                                                                                          |
| Notifications | In-app bell: connection requests and accepts, connections' check-ins, admin booking changes, review moderation, post-visit "leave a review"                                                                                                                 |
| Donations     | Buy Me a Coffee as the primary route (webhook records it automatically), plus a manual ledger for bank transfers that an admin confirms                                                                                                                     |
| Legal         | Public privacy policy, terms of service and community guidelines, linked from every signed-out page and confirmed at sign-up                                                                                                                                |
| Account       | Avatar upload, display name, password change, password reset by email, GDPR export and account deletion, blocked list, dark mode                                                                                                                            |
| Admin         | Reports queue, donations, bookings (+ CSV export), venues and branches CRUD, members (suspend), moderation feed, append-only audit log                                                                                                                      |

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
`0014_hardening.sql`, then `0015` through `0018` in order, then the two seed
files, in the Supabase SQL editor.

## Other environment variables

All optional. Each feature turns itself off cleanly when its variable is unset.

| Variable                  | Where  | What it does                                                                                   |
| ------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `VITE_SITE_URL`           | public | Public origin, no trailing slash. Needed for absolute Open Graph image URLs and `sitemap.xml`. |
| `VITE_SENTRY_DSN`         | public | Error monitoring. Unset, the SDK is never even downloaded — it loads through a dynamic import. |
| `VITE_SENTRY_ENVIRONMENT` | public | Overrides the environment tag on reports.                                                      |

Before launch, replace the placeholders in `src/lib/legal.ts` — the operator
name, address and contact email appear verbatim on the public policy pages. In
development the policy pages show a warning banner until you do.

Auth rate limiting needs no configuration: it is enforced by
`check_auth_rate()` from migration 0017, keyed on IP and email.

## Buy Me a Coffee

Two environment variables, both optional — with neither set, `/donate` falls
back to the manual form on its own and the webhook route answers 501.

| Variable             | Where       | What it does                                               |
| -------------------- | ----------- | ---------------------------------------------------------- |
| `VITE_BMC_USERNAME`  | public      | The handle after `buymeacoffee.com/`. Renders the button.  |
| `BMC_WEBHOOK_SECRET` | server only | Signing secret of the BMC webhook. Verifies each delivery. |

In the Buy Me a Coffee dashboard, point a webhook at
`https://<your-domain>/api/bmc-webhook` and copy its signing secret into
`BMC_WEBHOOK_SECRET`. Deliveries are verified with
`HMAC-SHA256(raw body, secret)` against the `x-signature-sha256` header before
anything is read out of the payload; `donations.provider_ref` is UNIQUE, so a
retried delivery collides instead of double-counting.

Recording a donation needs `SUPABASE_SERVICE_ROLE_KEY` on the server too — the
webhook has no user session, so it writes as service-role after the signature
checks out. That same key is what enables the admin role and delete controls;
without it those two buttons explain why they are unavailable and everything
else still works.

> BMC documents the event envelope and the signature scheme but not the field
> names inside `data`. `src/lib/buymeacoffee.ts` reads each value from a list
> of candidate spellings and refuses to record a donation it cannot parse; the
> route then logs the key names it actually received. Send one test event from
> the BMC dashboard and check the server log to confirm or correct that list.

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
  migrations/        0013_complete.sql is the canonical schema; 0014 hardens it,
                     0015 renames, 0016 donations + admin analytics,
                     0017 auth rate limits, 0018 meetups
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
