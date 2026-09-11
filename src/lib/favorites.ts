import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getCurrentUser, getSupabaseServerClient } from "./supabase/server";

/** Bounds mirror public.favorites in supabase/migrations/0005_engagement.sql. */
export const favoriteSchema = z.object({
  venueSlug: z.string().min(1).max(120),
});

export const fetchMyFavorites = createServerFn({ method: "GET" }).handler(
  async (): Promise<string[]> => {
    const supabase = getSupabaseServerClient();
    // No user_id filter needed: the "favorites: manage own" policy scopes
    // this to auth.uid() inside the database.
    const { data, error } = await supabase
      .from("favorites")
      .select("venue_slug")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[favorites] fetchMyFavorites failed:", error.message);
      throw new Error("Could not load your favourites");
    }
    return (data ?? []).map((row) => row.venue_slug as string);
  },
);

export const setFavoriteSchema = favoriteSchema.extend({
  favorited: z.boolean(),
});

/**
 * Set (not toggle) a venue's favourited state for the caller.
 *
 * Taking the target state from the client, rather than reading the current
 * state and flipping it, makes the operation idempotent: two concurrent
 * requests both wanting "unfavourited" both just DELETE (no-op if already
 * gone), and two both wanting "favourited" both UPSERT with
 * ignoreDuplicates. A delete-then-insert-if-nothing-deleted version raced
 * itself here — two concurrent "remove" clicks could see the first DELETE
 * remove the row and the second DELETE affect zero rows, which the second
 * request would misread as "wasn't favourited" and re-insert, silently
 * reverting a removal both callers intended. user_id is set explicitly on
 * the insert path because the column has no default — the RLS `with check`
 * only verifies the value, it does not supply one.
 */
export const setFavorite = createServerFn({ method: "POST" })
  .validator((data: unknown) => setFavoriteSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "Please sign in again." };

    if (!data.favorited) {
      const { error } = await supabase
        .from("favorites")
        .delete()
        .eq("venue_slug", data.venueSlug);

      if (error) {
        console.error("[favorites] delete failed:", error.message);
        return {
          ok: false as const,
          error: "Could not update your favourites.",
        };
      }
      return { ok: true as const, favorited: false };
    }

    const { error } = await supabase
      .from("favorites")
      .upsert(
        { user_id: user.id, venue_slug: data.venueSlug },
        { onConflict: "user_id,venue_slug", ignoreDuplicates: true },
      );

    if (error) {
      console.error("[favorites] insert failed:", error.message);
      return { ok: false as const, error: "Could not update your favourites." };
    }

    return { ok: true as const, favorited: true };
  });
