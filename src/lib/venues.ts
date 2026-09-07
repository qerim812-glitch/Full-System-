import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getSupabaseServerClient } from "./supabase/server";
import { summarizeReviews } from "./reviews";

/**
 * Shapes mirror the SQL in supabase/migrations/0003_venues.sql.
 *
 * Hand-written for now. Once the schema is applied you can replace these with
 * generated types:
 *   supabase gen types typescript --linked > src/lib/database.types.ts
 */
export type Venue = {
  slug: string;
  name: string;
  description: string;
  image_url: string | null;
  location_url: string | null;
  min_age: number;
  max_age: number;
  capacity: number;
};

export type VenueLocation = {
  id: string;
  venue_slug: string;
  name: string;
};

export const fetchVenues = createServerFn({ method: "GET" }).handler(
  async (): Promise<Venue[]> => {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("venues")
      .select(
        "slug, name, description, image_url, location_url, min_age, max_age, capacity",
      )
      .eq("is_active", true)
      .order("name");

    if (error) {
      console.error("[venues] fetchVenues failed:", error.message);
      throw new Error("Could not load venues");
    }
    return data ?? [];
  },
);

const slugSchema = z.object({ slug: z.string().min(1).max(120) });

export const fetchVenue = createServerFn({ method: "GET" })
  .validator((data: unknown) => slugSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();

    const [venueResult, locationsResult, reviewsResult] = await Promise.all([
      supabase
        .from("venues")
        .select(
          "slug, name, description, image_url, location_url, min_age, max_age, capacity",
        )
        .eq("slug", data.slug)
        .maybeSingle(),
      supabase
        .from("venue_locations")
        .select("id, venue_slug, name")
        .eq("venue_slug", data.slug)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("reviews")
        .select("id, rating, comment, created_at")
        .eq("venue_slug", data.slug)
        .eq("is_hidden", false)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (venueResult.error || !venueResult.data) {
      return null;
    }

    const reviews = reviewsResult.data ?? [];
    const { count: reviewCount, average: averageRating } =
      summarizeReviews(reviews);

    return {
      venue: venueResult.data as Venue,
      locations: (locationsResult.data ?? []) as VenueLocation[],
      reviews,
      averageRating,
      reviewCount,
    };
  });

const availabilitySchema = z.object({
  slug: z.string().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Live occupancy for a venue on a date, via the venue_availability() RPC.
 * Replaces the prototype's hardcoded `activeCount` constant.
 */
export const fetchAvailability = createServerFn({ method: "GET" })
  .validator((data: unknown) => availabilitySchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { data: rows, error } = await supabase.rpc("venue_availability", {
      p_venue_slug: data.slug,
      p_booking_date: data.date,
    });

    if (error) {
      console.error("[venues] availability failed:", error.message);
      return [];
    }
    return (rows ?? []) as Array<{
      booking_time: string;
      seats_taken: number;
      seats_left: number;
    }>;
  });
