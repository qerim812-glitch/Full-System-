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

/**
 * Toggle a venue in the caller's favourites.
 *
 * Delete first, and only insert when the delete removed nothing. user_id is
 * set explicitly because the column has no default — the RLS `with check`
 * only verifies the value, it does not supply one.
 */
export const toggleFavorite = createServerFn({ method: "POST" })
  .validator((data: unknown) => favoriteSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "Please sign in again." };

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
      .insert({ user_id: user.id, venue_slug: data.venueSlug });

    if (insertError) {
      // A concurrent request already favourited it. That is the end state the
      // caller wanted, so report success rather than a spurious error.
      if (/duplicate key|favorites_pkey/i.test(insertError.message)) {
        return { ok: true as const, favorited: true };
      }
      console.error("[favorites] insert failed:", insertError.message);
      return { ok: false as const, error: "Could not update your favourites." };
    }

    return { ok: true as const, favorited: true };
  });
