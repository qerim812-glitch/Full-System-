import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getCurrentUser, getSupabaseServerClient } from "./supabase/server";

export type Review = {
  id: string;
  venue_slug: string;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Bounds mirror the CHECK constraints in supabase/migrations/0005_engagement.sql.
 * `rating` uses z.coerce so HTML form fields (which submit strings) pass
 * without a manual Number() cast.
 */
export const reviewInputSchema = z.object({
  venueSlug: z.string().min(1).max(120),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});

const venueOnlySchema = z.object({ venueSlug: z.string().min(1).max(120) });

/**
 * Pure function — no I/O — so it is unit-testable without a live database.
 *
 * The RLS rejection is the one failure a user can act on: the
 * "reviews: write own after visiting" policy requires a completed booking.
 * Without this mapping the user sees a raw Postgres string.
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

/**
 * Pure aggregation helper. Used in Task 5 to replace the inline reduce in
 * `fetchVenue` and tested without a database in reviews.test.ts.
 */
export function summarizeReviews(reviews: Array<{ rating: number }>): {
  count: number;
  average: number | null;
} {
  if (reviews.length === 0) return { count: 0, average: null };
  const total = reviews.reduce((sum, r) => sum + r.rating, 0);
  return { count: reviews.length, average: total / reviews.length };
}

/**
 * Fetches the signed-in caller's own review for a venue, or null.
 *
 * The "reviews: public read visible" policy makes all non-hidden reviews
 * readable, so we must filter by user_id explicitly — the policy is not
 * scoping this query to the current user.
 */
export const fetchMyReview = createServerFn({ method: "GET" })
  .validator((data: unknown) => venueOnlySchema.parse(data))
  .handler(async ({ data }): Promise<Review | null> => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return null;

    const { data: row, error } = await supabase
      .from("reviews")
      .select("id, venue_slug, rating, comment, created_at, updated_at")
      .eq("venue_slug", data.venueSlug)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[reviews] fetchMyReview failed:", error.message);
      return null;
    }
    return (row as Review | null) ?? null;
  });

/**
 * Upsert on the (user_id, venue_slug) unique constraint so a second
 * submission updates rather than errors.
 *
 * The "reviews: write own after visiting" RLS policy rejects inserts when
 * the caller has no completed booking for the venue. `mapReviewError`
 * translates that Postgres message into user-readable copy.
 */
export const upsertMyReview = createServerFn({ method: "POST" })
  .validator((data: unknown) => reviewInputSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
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

/**
 * Deletes the caller's own review for a venue.
 * "reviews: delete own" makes any other user's row match nothing, so no
 * explicit user_id filter is needed here.
 */
export const deleteMyReview = createServerFn({ method: "POST" })
  .validator((data: unknown) => venueOnlySchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();

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
