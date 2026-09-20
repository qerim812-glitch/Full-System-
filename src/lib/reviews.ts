import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getCurrentUser, getSupabaseServerClient } from "./supabase/server";

export type Review = {
  id: string;
  venue_slug: string;
  rating: number;
  comment: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
};

const REVIEW_PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const REVIEW_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

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
      .select(
        "id, venue_slug, rating, comment, photo_url, created_at, updated_at",
      )
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
 * Whether the caller has actually visited, and so may leave a review.
 *
 * Mirrors the condition in the "reviews: write own after visiting" policy.
 * Without this the form is offered to everyone and the requirement only
 * surfaces as an RLS rejection after they have written something.
 *
 * The RLS "bookings: read own" policy scopes the count to the caller.
 */
export const canReviewVenue = createServerFn({ method: "GET" })
  .validator((data: unknown) => venueOnlySchema.parse(data))
  .handler(async ({ data }): Promise<boolean> => {
    const supabase = getSupabaseServerClient();

    const { count, error } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("venue_slug", data.venueSlug)
      .eq("status", "completed");

    if (error) {
      console.error("[reviews] canReviewVenue failed:", error.message);
      return false;
    }
    return (count ?? 0) > 0;
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
 * Attach a photo to the caller's review of a venue (one per review; a new
 * upload replaces it). Runs after upsertMyReview, so the review row exists.
 */
export const uploadReviewPhoto = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Expected form data");
    const file = data.get("photo");
    if (!(file instanceof File)) throw new Error("Choose an image");
    return {
      venueSlug: z.string().min(1).max(120).parse(data.get("venueSlug")),
      file,
    };
  })
  .handler(async ({ data }) => {
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "Please sign in again." };
    const ext = REVIEW_PHOTO_TYPES[data.file.type];
    if (!ext) {
      return { ok: false as const, error: "Use a JPEG, PNG or WebP image." };
    }
    if (data.file.size > REVIEW_PHOTO_MAX_BYTES) {
      return { ok: false as const, error: "Photos must be under 5 MB." };
    }
    const supabase = getSupabaseServerClient();
    const path = `${user.id}/${data.venueSlug}.${ext}`;
    const bytes = new Uint8Array(await data.file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from("review-photos")
      .upload(path, bytes, {
        upsert: true,
        contentType: data.file.type,
        cacheControl: "3600",
      });
    if (uploadError) {
      console.error("[reviews] photo upload failed:", uploadError.message);
      return {
        ok: false as const,
        error: /bucket not found/i.test(uploadError.message)
          ? "Photo storage is not set up yet (run migration 0024)."
          : "Upload failed. Please try again.",
      };
    }
    const publicUrl = supabase.storage.from("review-photos").getPublicUrl(path)
      .data.publicUrl;
    const photoUrl = `${publicUrl}?v=${Date.now()}`;
    const { error } = await supabase
      .from("reviews")
      .update({ photo_url: photoUrl })
      .eq("user_id", user.id)
      .eq("venue_slug", data.venueSlug);
    if (error) {
      console.error("[reviews] photo save failed:", error.message);
      return { ok: false as const, error: "Could not save the photo." };
    }
    return { ok: true as const, photoUrl };
  });

export const removeReviewPhoto = createServerFn({ method: "POST" })
  .validator((data: unknown) => venueOnlySchema.parse(data))
  .handler(async ({ data }) => {
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "Please sign in again." };
    const supabase = getSupabaseServerClient();
    await supabase.storage
      .from("review-photos")
      .remove(
        Object.values(REVIEW_PHOTO_TYPES).map(
          (e) => `${user.id}/${data.venueSlug}.${e}`,
        ),
      );
    const { error } = await supabase
      .from("reviews")
      .update({ photo_url: null })
      .eq("user_id", user.id)
      .eq("venue_slug", data.venueSlug);
    if (error) {
      return { ok: false as const, error: "Could not remove the photo." };
    }
    return { ok: true as const };
  });

/**
 * Deletes the caller's own review for a venue.
 *
 * The user_id filter is NOT redundant: "reviews: admin moderates" is FOR ALL,
 * so an admin pressing "Remove my review" on the venue page would otherwise
 * delete every review for that venue.
 */
export const deleteMyReview = createServerFn({ method: "POST" })
  .validator((data: unknown) => venueOnlySchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "Please sign in again." };

    const { error } = await supabase
      .from("reviews")
      .delete()
      .eq("venue_slug", data.venueSlug)
      .eq("user_id", user.id);

    if (error) {
      console.error("[reviews] delete failed:", error.message);
      return { ok: false as const, error: "Could not remove your review." };
    }
    return { ok: true as const };
  });
