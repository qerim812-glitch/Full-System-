# Engagement (Favourites + Review Writing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user favourite venues and write/edit a review of a venue they actually visited, and unblock reviews by making bookings reach `completed`.

**Architecture:** Follows the established Phase 2 pattern exactly — `createServerFn` handlers in `src/lib/*.ts` that call `getSupabaseServerClient()` and rely on RLS for authorization rather than filtering by `user_id` in app code. Mutations return `{ok: true} | {ok: false, error}` unions instead of throwing. Pure logic (schemas, error mapping, aggregation) is exported separately so it can be unit-tested without a live database.

**Tech Stack:** TanStack Start 1.168, React 19, Supabase (`@supabase/ssr`), zod 3, Tailwind 4 + shadcn/Radix, Vitest (added by Task 0), Bun as the runner.

**Spec:** No written spec file. Requirements were settled in-session on 2026-09-07:
- Build engagement first of five subsystems (favourites + review writing).
- Bookings reach `completed` via a **scheduled job** (pg_cron), leaving the `reviews` insert policy unchanged.
- Remaining subsystems get their own plans: messaging, donations, hardening/tests, Vercel deploy.

## Global Constraints

- Never filter by `user_id` in a server function where an RLS policy already scopes the query — the database is the authorization boundary. (Mirrors the comment in `src/lib/bookings.ts:22`.)
- Mutations return `{ok: true, …} | {ok: false, error: string}`. Do not throw for user-actionable failures.
- Only pass a Postgres error message through to the UI if it is user-actionable; otherwise `console.error` it and return a generic string. (Pattern: `src/lib/bookings.ts:78-101`.)
- `tsconfig.json` is strict: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`. Index-signature access must use bracket notation.
- Do NOT add vite plugins to `vite.config.ts` — `@lovable.dev/vite-tanstack-config` already includes tanstackStart, viteReact, tailwindcss, tsConfigPaths and nitro. Duplicates break the app.
- Do not force-push or rewrite pushed history — the repo is Lovable-connected (`AGENTS.md`).
- All new SQL goes in a new numbered migration. Never edit an already-committed migration.
- Timestamps: `booking_date`/`booking_time` are wall-clock in Tirana. Any comparison against `now()` must be explicit with `at time zone 'Europe/Tirane'`.
- Run `bunx tsc --noEmit` and `bun run lint` before each commit.

---

### Task 0: Test infrastructure

Nothing in this repo is tested and there is no runner. Every later task's TDD steps depend on this, so it is folded in here as its own gated deliverable.

**Files:**
- Modify: `package.json` (add `vitest` devDependency + `test` scripts)
- Create: `vitest.config.ts`
- Create: `src/lib/__tests__/setup.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `bun run test` (single run) and `bun run test:watch`. Test files are discovered at `src/**/*.test.ts`.

- [ ] **Step 1: Install Vitest**

```bash
bun add -d vitest@^3.2.4
```

- [ ] **Step 2: Create `vitest.config.ts`**

A standalone config, NOT the Lovable wrapper — the wrapper pulls in nitro and the TanStack Start plugin, which try to build a server and will fail under Vitest. Only `vite-tsconfig-paths` is needed so `@/*` imports resolve.

```ts
import { defineConfig } from "vitest/config";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsConfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Add test scripts to `package.json`**

In the `"scripts"` block, after `"format"`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 4: Write a smoke test that fails**

Create `src/lib/__tests__/setup.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("resolves the @/ path alias", async () => {
    const { cn } = await import("@/lib/utils");
    expect(cn("a", "b")).toBe("a b");
  });
});
```

- [ ] **Step 5: Run it and confirm it passes**

Run: `bun run test`
Expected: 1 passed. If the `@/lib/utils` import fails to resolve, `tsConfigPaths()` is not wired correctly in `vitest.config.ts` — fix that before continuing.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock vitest.config.ts src/lib/__tests__/setup.test.ts
git commit -m "test: add vitest harness"
```

---

### Task 1: Make bookings reach `completed` (unblocks reviews)

The `"reviews: write own after visiting"` policy in `supabase/migrations/0005_engagement.sql:53` requires a booking with `status = 'completed'`. Nothing in the codebase or schema ever sets that status — `book_venue()` inserts `'confirmed'` and `cancelBooking` sets `'cancelled'`. Without this task, review insertion fails for every user.

**Files:**
- Create: `supabase/migrations/0009_booking_completion.sql`
- Modify: `supabase/README.md` (document the new migration + the pg_cron requirement)

**Interfaces:**
- Consumes: `public.bookings` from `0004_bookings.sql`.
- Produces: SQL function `public.complete_past_bookings() returns integer` (returns the number of rows transitioned). Task 4 depends on `status = 'completed'` becoming reachable.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0009_booking_completion.sql`:

```sql
-- ============================================================================
-- 0009_booking_completion.sql
-- Nothing ever moved a booking to 'completed', which silently made the
-- "reviews: write own after visiting" policy in 0005 impossible to satisfy:
-- it requires a completed booking, so no user could ever write a review.
--
-- booking_date/booking_time are wall-clock Tirana values, while now() is
-- timestamptz. The comparison is written with an explicit `at time zone` so
-- the cutoff does not silently drift by the UTC offset (1-2h for Tirana).
-- ============================================================================

create or replace function public.complete_past_bookings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.bookings
     set status = 'completed'
   where status = 'confirmed'
     and ((booking_date + booking_time) at time zone 'Europe/Tirane') < now();

  get diagnostics affected = row_count;
  return affected;
end;
$$;

comment on function public.complete_past_bookings is
  'Transitions confirmed bookings whose local start time has passed to '
  'completed. Scheduled every 15 minutes via pg_cron; also safe to call '
  'manually. Idempotent: re-running transitions nothing new.';

-- security definer, so lock it down: no direct calls from the client.
revoke execute on function public.complete_past_bookings() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Schedule. Requires the pg_cron extension (Supabase: Database > Extensions).
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron with schema extensions;

-- Idempotent re-registration: unschedule first if this migration is re-run.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'complete-past-bookings') then
    perform cron.unschedule('complete-past-bookings');
  end if;
end;
$$;

select cron.schedule(
  'complete-past-bookings',
  '*/15 * * * *',
  $$select public.complete_past_bookings()$$
);
```

- [ ] **Step 2: Verify the SQL parses and dollar-quoting is balanced**

Run:

```bash
grep -c '\$\$' supabase/migrations/0009_booking_completion.sql
```

Expected: an even number (every `$$` opens and closes). If odd, a quote block is unterminated.

- [ ] **Step 3: Apply it against the Supabase project**

Paste the file into the Supabase SQL editor and run it, then confirm the job registered:

```sql
select jobname, schedule from cron.job where jobname = 'complete-past-bookings';
```

Expected: one row, schedule `*/15 * * * *`.

If pg_cron is not available on the project, stop and report it — the fallback is to relax the reviews policy instead, which is a different decision and needs sign-off.

- [ ] **Step 4: Confirm the function transitions a past booking**

```sql
select public.complete_past_bookings();
```

Expected: an integer. Running it a second time returns `0`, proving idempotency.

- [ ] **Step 5: Document it in `supabase/README.md`**

Add `0009_booking_completion.sql` to the run-order list, with a note that pg_cron must be enabled and that this migration is what makes review writing possible.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0009_booking_completion.sql supabase/README.md
git commit -m "feat(db): transition past bookings to completed via pg_cron"
```

---

### Task 2: Favourites data layer

**Files:**
- Create: `src/lib/favorites.ts`
- Create: `src/lib/__tests__/favorites.test.ts`

**Interfaces:**
- Consumes: `getSupabaseServerClient` from `src/lib/supabase/server`.
- Produces:
  - `favoriteSchema: z.ZodType<{ venueSlug: string }>`
  - `fetchMyFavorites(): Promise<string[]>` — venue slugs, newest first
  - `toggleFavorite({ data: { venueSlug } }): Promise<{ok: true, favorited: boolean} | {ok: false, error: string}>`
  - Task 3 consumes all three.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/favorites.test.ts`. Only the pure schema is asserted here — the server functions are exercised in the app, and mocking `createServerFn` end-to-end buys little.

```ts
import { describe, expect, it } from "vitest";

import { favoriteSchema } from "@/lib/favorites";

describe("favoriteSchema", () => {
  it("accepts a normal slug", () => {
    expect(favoriteSchema.parse({ venueSlug: "radio-bar" })).toEqual({
      venueSlug: "radio-bar",
    });
  });

  it("rejects an empty slug", () => {
    expect(() => favoriteSchema.parse({ venueSlug: "" })).toThrow();
  });

  it("rejects a slug beyond the venues.slug length budget", () => {
    expect(() =>
      favoriteSchema.parse({ venueSlug: "x".repeat(121) }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `bun run test src/lib/__tests__/favorites.test.ts`
Expected: FAIL — cannot resolve `@/lib/favorites`.

- [ ] **Step 3: Implement `src/lib/favorites.ts`**

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getSupabaseServerClient } from "./supabase/server";

/** Mirrors public.favorites in supabase/migrations/0005_engagement.sql. */
export const favoriteSchema = z.object({
  venueSlug: z.string().min(1).max(120),
});

export const fetchMyFavorites = createServerFn({ method: "GET" }).handler(
  async (): Promise<string[]> => {
    const supabase = getSupabaseServerClient();
    // "favorites: manage own" scopes this to auth.uid() in the database.
    const { data, error } = await supabase
      .from("favorites")
      .select("venue_slug")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[favorites] fetchMyFavorites failed:", error.message);
      throw new Error("Could not load your favourites");
    }
    return (data ?? []).map((row) => row.venue_slug);
  },
);

/**
 * Toggle in one round trip's worth of intent: delete first, and only insert
 * when the delete removed nothing. Racing this with itself is harmless — the
 * (user_id, venue_slug) primary key makes a double insert fail loudly rather
 * than duplicating a row.
 */
export const toggleFavorite = createServerFn({ method: "POST" })
  .validator((data: unknown) => favoriteSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();

    const { data: removed, error: deleteError } = await supabase
      .from("favorites")
      .delete()
      .eq("venue_slug", data.venueSlug)
      .select("venue_slug");

    if (deleteError) {
      console.error("[favorites] delete failed:", deleteError.message);
      return { ok: false as const, error: "Could not update your favourites." };
    }

    if ((removed ?? []).length > 0) {
      return { ok: true as const, favorited: false };
    }

    const { error: insertError } = await supabase
      .from("favorites")
      .insert({ venue_slug: data.venueSlug });

    if (insertError) {
      // Already favourited by a concurrent request: the desired end state.
      if (/duplicate key|favorites_pkey/i.test(insertError.message)) {
        return { ok: true as const, favorited: true };
      }
      console.error("[favorites] insert failed:", insertError.message);
      return { ok: false as const, error: "Could not update your favourites." };
    }

    return { ok: true as const, favorited: true };
  });
```

Note: `favorites.user_id` has no default in the schema, so the insert relies on the column being filled by the RLS `with check (auth.uid() = user_id)` path. If the insert fails with a not-null violation on `user_id`, add `user_id` explicitly from `fetchAuthUser()` — verify this in Step 4 before moving on.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `bun run test src/lib/__tests__/favorites.test.ts`
Expected: 3 passed.

Then typecheck: `bunx tsc --noEmit` — expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/favorites.ts src/lib/__tests__/favorites.test.ts
git commit -m "feat: add favourites data layer"
```

---

### Task 3: Favourites UI

**Files:**
- Create: `src/components/FavoriteButton.tsx`
- Modify: `src/routes/_authed/venues.tsx` (load favourites, render the button per card)
- Modify: `src/routes/_authed/venues.$slug.tsx` (render the button in the venue header)

**Interfaces:**
- Consumes: `fetchMyFavorites`, `toggleFavorite` from Task 2.
- Produces: `<FavoriteButton venueSlug={string} initialFavorited={boolean} />`.

- [ ] **Step 1: Read the two routes you are about to modify**

```bash
sed -n '1,60p' src/routes/_authed/venues.tsx
sed -n '1,60p' src/routes/_authed/venues.\$slug.tsx
```

Note how each declares `loader` and reads `Route.useLoaderData()` — match that shape rather than introducing `useQuery`.

- [ ] **Step 2: Create the button component**

```tsx
import { useRouter } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { toggleFavorite } from "../lib/favorites";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

/**
 * Optimistic: flips immediately, reverts if the server disagrees. A favourite
 * is low-stakes enough that waiting on a round trip feels broken.
 */
export function FavoriteButton({
  venueSlug,
  initialFavorited,
}: {
  venueSlug: string;
  initialFavorited: boolean;
}) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, setPending] = useState(false);

  async function handleClick() {
    const next = !favorited;
    setFavorited(next);
    setPending(true);

    const result = await toggleFavorite({ data: { venueSlug } });

    setPending(false);
    if (!result.ok) {
      setFavorited(!next);
      toast.error(result.error);
      return;
    }
    setFavorited(result.favorited);
    await router.invalidate();
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={favorited}
      aria-label={favorited ? "Remove from favourites" : "Add to favourites"}
    >
      <Heart
        className={cn(
          "size-4",
          favorited ? "fill-current text-red-500" : "text-muted-foreground",
        )}
      />
    </Button>
  );
}
```

- [ ] **Step 3: Load favourites in the venues list route**

In `src/routes/_authed/venues.tsx`, widen the loader to fetch both, and render a `<FavoriteButton>` on each card:

```tsx
loader: async () => {
  const [venues, favorites] = await Promise.all([
    fetchVenues(),
    fetchMyFavorites(),
  ]);
  return { venues, favorites };
},
```

Then in the component, build a `Set` once and pass membership down:

```tsx
const { venues, favorites } = Route.useLoaderData();
const favoriteSet = new Set(favorites);
// ...per card:
<FavoriteButton
  venueSlug={venue.slug}
  initialFavorited={favoriteSet.has(venue.slug)}
/>
```

- [ ] **Step 4: Do the same on the venue detail route**

In `src/routes/_authed/venues.$slug.tsx`, add `fetchMyFavorites()` to the loader's `Promise.all` and render the button beside the venue name.

- [ ] **Step 5: Verify it builds and typechecks**

Run:

```bash
bunx tsc --noEmit && bun run lint && bun run build
```

Expected: no type errors, no lint errors, build succeeds.

- [ ] **Step 6: Verify by hand**

Run `bun run dev`, sign in, open `/venues`. Click a heart — it fills instantly. Reload the page — it stays filled. Click again — it empties and stays empty after reload.

- [ ] **Step 7: Commit**

```bash
git add src/components/FavoriteButton.tsx src/routes/_authed/venues.tsx "src/routes/_authed/venues.\$slug.tsx"
git commit -m "feat: favourite venues from the list and detail pages"
```

---

### Task 4: Review writing data layer

**Files:**
- Create: `src/lib/reviews.ts`
- Create: `src/lib/__tests__/reviews.test.ts`

**Interfaces:**
- Consumes: `getSupabaseServerClient`; depends on Task 1 for `status = 'completed'` to be reachable.
- Produces:
  - `reviewInputSchema` — `{ venueSlug: string, rating: 1-5, comment?: string }`
  - `mapReviewError(message: string): string` — pure; maps a Postgres message to user-facing copy
  - `summarizeReviews(reviews: Array<{rating: number}>): {count: number, average: number | null}` — pure
  - `upsertMyReview(...)`: `{ok: true} | {ok: false, error: string}`
  - `deleteMyReview({ data: { venueSlug } })`: `{ok: true} | {ok: false, error: string}`
  - `fetchMyReview({ data: { venueSlug } })`: the caller's own review or `null`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/reviews.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  mapReviewError,
  reviewInputSchema,
  summarizeReviews,
} from "@/lib/reviews";

describe("reviewInputSchema", () => {
  it("accepts a rating with no comment", () => {
    expect(reviewInputSchema.parse({ venueSlug: "radio-bar", rating: 4 }))
      .toMatchObject({ venueSlug: "radio-bar", rating: 4 });
  });

  it("coerces a string rating from a form field", () => {
    expect(
      reviewInputSchema.parse({ venueSlug: "radio-bar", rating: "5" }).rating,
    ).toBe(5);
  });

  it("rejects a rating outside 1-5", () => {
    expect(() =>
      reviewInputSchema.parse({ venueSlug: "radio-bar", rating: 6 }),
    ).toThrow();
    expect(() =>
      reviewInputSchema.parse({ venueSlug: "radio-bar", rating: 0 }),
    ).toThrow();
  });

  it("rejects a comment past the 2000-char database ceiling", () => {
    expect(() =>
      reviewInputSchema.parse({
        venueSlug: "radio-bar",
        rating: 3,
        comment: "x".repeat(2001),
      }),
    ).toThrow();
  });
});

describe("mapReviewError", () => {
  it("explains an RLS rejection as the visit requirement", () => {
    const copy = mapReviewError(
      'new row violates row-level security policy for table "reviews"',
    );
    expect(copy).toMatch(/visit/i);
  });

  it("falls back to generic copy for anything unrecognised", () => {
    expect(mapReviewError("connection reset by peer")).toMatch(
      /could not save/i,
    );
  });
});

describe("summarizeReviews", () => {
  it("returns a null average with no reviews", () => {
    expect(summarizeReviews([])).toEqual({ count: 0, average: null });
  });

  it("averages ratings", () => {
    expect(summarizeReviews([{ rating: 5 }, { rating: 4 }])).toEqual({
      count: 2,
      average: 4.5,
    });
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `bun run test src/lib/__tests__/reviews.test.ts`
Expected: FAIL — cannot resolve `@/lib/reviews`.

- [ ] **Step 3: Implement `src/lib/reviews.ts`**

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getSupabaseServerClient } from "./supabase/server";

export type Review = {
  id: string;
  venue_slug: string;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

/** Bounds mirror the CHECK constraints in 0005_engagement.sql. */
export const reviewInputSchema = z.object({
  venueSlug: z.string().min(1).max(120),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});

const venueOnlySchema = z.object({ venueSlug: z.string().min(1).max(120) });

/**
 * Pure so it is unit-testable. The RLS rejection is the one failure a user can
 * act on: the "reviews: write own after visiting" policy requires a completed
 * booking, and without this mapping the user just sees a raw Postgres string.
 */
export function mapReviewError(message: string): string {
  if (/row-level security/i.test(message)) {
    return "You can only review a venue after you have visited it.";
  }
  if (/reviews_rating_check/i.test(message)) {
    return "Pick a rating between 1 and 5.";
  }
  if (/char_length|comment/i.test(message)) {
    return "That comment is too long.";
  }
  return "Could not save your review. Please try again.";
}

export function summarizeReviews(reviews: Array<{ rating: number }>): {
  count: number;
  average: number | null;
} {
  if (reviews.length === 0) return { count: 0, average: null };
  const total = reviews.reduce((sum, r) => sum + r.rating, 0);
  return { count: reviews.length, average: total / reviews.length };
}

export const fetchMyReview = createServerFn({ method: "GET" })
  .validator((data: unknown) => venueOnlySchema.parse(data))
  .handler(async ({ data }): Promise<Review | null> => {
    const supabase = getSupabaseServerClient();
    // "reviews: public read visible" lets a user always read their own row.
    const { data: row, error } = await supabase
      .from("reviews")
      .select("id, venue_slug, rating, comment, created_at, updated_at")
      .eq("venue_slug", data.venueSlug)
      .maybeSingle();

    if (error) {
      console.error("[reviews] fetchMyReview failed:", error.message);
      return null;
    }
    return (row as Review | null) ?? null;
  });
```

Important: `fetchMyReview` above reads whichever visible review matches the slug, which for a signed-in user includes other people's. Constrain it to the caller by selecting on `user_id` from the verified session:

```ts
import { fetchAuthUser } from "./auth";
// inside the handler, before the query:
const user = await fetchAuthUser();
if (!user) return null;
// ...then add to the query chain:
//   .eq("user_id", user.id)
```

This is the one place a `user_id` filter is correct despite the global constraint: the policy grants read access to *all* visible reviews, so it is not scoping this query for us.

Now append the mutations:

```ts
/**
 * Upsert on the (user_id, venue_slug) unique constraint — the schema comment
 * in 0005 says editing replaces the review, so a second submission updates
 * rather than erroring.
 */
export const upsertMyReview = createServerFn({ method: "POST" })
  .validator((data: unknown) => reviewInputSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const user = await fetchAuthUser();
    if (!user) return { ok: false as const, error: "Please sign in again." };

    const { error } = await supabase.from("reviews").upsert(
      {
        user_id: user.id,
        venue_slug: data.venueSlug,
        rating: data.rating,
        comment: data.comment ?? null,
      },
      { onConflict: "user_id,venue_slug" },
    );

    if (error) {
      console.error("[reviews] upsert failed:", error.message);
      return { ok: false as const, error: mapReviewError(error.message) };
    }
    return { ok: true as const };
  });

export const deleteMyReview = createServerFn({ method: "POST" })
  .validator((data: unknown) => venueOnlySchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    // "reviews: delete own" makes someone else's row match nothing.
    const { error } = await supabase
      .from("reviews")
      .delete()
      .eq("venue_slug", data.venueSlug);

    if (error) {
      console.error("[reviews] delete failed:", error.message);
      return { ok: false as const, error: "Could not remove your review." };
    }
    return { ok: true as const };
  });
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `bun run test src/lib/__tests__/reviews.test.ts`
Expected: 8 passed.

Then: `bunx tsc --noEmit` — expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reviews.ts src/lib/__tests__/reviews.test.ts
git commit -m "feat: add review writing data layer"
```

---

### Task 5: Review writing UI on the venue page

**Files:**
- Create: `src/components/ReviewForm.tsx`
- Modify: `src/routes/_authed/venues.$slug.tsx` (load own review, render form + list)
- Modify: `src/lib/venues.ts:76-90` (reuse `summarizeReviews` instead of the inline average)

**Interfaces:**
- Consumes: `upsertMyReview`, `deleteMyReview`, `fetchMyReview`, `summarizeReviews` from Task 4.
- Produces: `<ReviewForm venueSlug={string} existing={Review | null} />`.

- [ ] **Step 1: Create the form**

```tsx
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { deleteMyReview, upsertMyReview, type Review } from "../lib/reviews";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

export function ReviewForm({
  venueSlug,
  existing,
}: {
  venueSlug: string;
  existing: Review | null;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(existing?.rating ?? 5);
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    const result = await upsertMyReview({
      data: { venueSlug, rating, comment: comment.trim() || undefined },
    });
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(existing ? "Review updated" : "Thanks for the review");
    await router.invalidate();
  }

  async function handleDelete() {
    setPending(true);
    const result = await deleteMyReview({ data: { venueSlug } });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setComment("");
    setRating(5);
    await router.invalidate();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border p-4">
      <div className="space-y-1">
        <Label htmlFor="rating">Rating</Label>
        <select
          id="rating"
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
          className="w-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="comment">Comment (optional)</Label>
        <Textarea
          id="comment"
          value={comment}
          maxLength={2000}
          onChange={(e) => setComment(e.target.value)}
          placeholder="How was it?"
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {existing ? "Update review" : "Post review"}
        </Button>
        {existing ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={handleDelete}
          >
            Remove
          </Button>
        ) : null}
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Wire it into the venue detail route**

Add `fetchMyReview({ data: { slug } })` to the loader's `Promise.all` in `src/routes/_authed/venues.$slug.tsx`, then render `<ReviewForm venueSlug={slug} existing={myReview} />` above the existing reviews list.

- [ ] **Step 3: Replace the inline average in `src/lib/venues.ts`**

`fetchVenue` computes `averageRating` inline at `src/lib/venues.ts:76-90`. Import and use the tested helper instead:

```ts
import { summarizeReviews } from "./reviews";
// replace the inline reduce with:
const { count, average } = summarizeReviews(reviews);
return { venue: venueResult.data as Venue, locations, reviews, averageRating: average, reviewCount: count };
```

Update any consumer that reads `averageRating` so it still compiles.

- [ ] **Step 4: Verify**

Run:

```bash
bun run test && bunx tsc --noEmit && bun run lint && bun run build
```

Expected: all tests pass, no type errors, no lint errors, build succeeds.

- [ ] **Step 5: Verify the visit requirement by hand**

Run `bun run dev`. On a venue you have never booked, submitting a review must show *"You can only review a venue after you have visited it."* — that proves the RLS policy is enforcing and `mapReviewError` is wired. Then, on a venue with a booking that Task 1 moved to `completed`, submitting must succeed and the review must appear in the list.

- [ ] **Step 6: Commit**

```bash
git add src/components/ReviewForm.tsx "src/routes/_authed/venues.\$slug.tsx" src/lib/venues.ts
git commit -m "feat: write, edit and remove venue reviews"
```

---

## Self-Review

**Spec coverage:**
- Favourites → Tasks 2, 3. ✅
- Review writing → Tasks 4, 5. ✅
- Blocker: `completed` unreachable → Task 1. ✅
- Test harness (part of the "hardening" selection, required here for TDD) → Task 0. ✅
- Messaging / donations / Vercel deploy → deliberately out of scope; separate plans.

**Placeholder scan:** No TBDs. Every code step carries real code. Two steps intentionally say "read the file first" (Task 3 Step 1) because the existing route bodies were not read in full when this plan was written — that is a read instruction, not a deferred decision.

**Type consistency:** `Review` is defined in Task 4 and consumed by name in Task 5. `summarizeReviews` returns `{count, average}` in Task 4 and is destructured as `{count, average}` in Task 5 Step 3. `toggleFavorite` returns `{ok, favorited}` in Task 2 and is read as `result.favorited` in Task 3.

**Known risk:** Task 2 Step 3 flags that `favorites.user_id` has no default and may need an explicit value; Task 4 sets `user_id` explicitly for exactly that reason. If Task 2's insert fails in verification, mirror Task 4's approach.
