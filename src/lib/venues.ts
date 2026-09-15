import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { displayNameFor, loadProfiles } from "./people";
import { getSupabaseServerClient } from "./supabase/server";

/**
 * Shapes mirror the SQL in supabase/migrations/0013_complete.sql plus the
 * columns added by 0014_hardening.sql (hours, address, category, …).
 */
export type Venue = {
  slug: string;
  name: string;
  description: string;
  image_url: string | null;
  location_url: string | null;
  address: string | null;
  phone: string | null;
  category: string;
  price_band: number;
  opens_at: string;
  closes_at: string;
  slot_minutes: number;
  min_age: number;
  max_age: number;
  capacity: number;
  /** From venue_rating_summary; null when the venue has no visible reviews. */
  average_rating: number | null;
  review_count: number;
};

export type VenueLocation = {
  id: string;
  venue_slug: string;
  name: string;
  address: string | null;
  capacity: number | null;
};

export type VenueReview = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  user_id: string;
  author_name: string;
  author_avatar: string | null;
};

const VENUE_COLUMNS =
  "slug, name, description, image_url, location_url, address, phone, category, price_band, opens_at, closes_at, slot_minutes, min_age, max_age, capacity";

type RatingRow = {
  venue_slug: string;
  average_rating: number | string | null;
  review_count: number | null;
};

async function loadRatings(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  slugs: string[],
): Promise<Map<string, { average: number | null; count: number }>> {
  if (slugs.length === 0) return new Map();
  const { data, error } = await supabase
    .from("venue_rating_summary")
    .select("venue_slug, average_rating, review_count")
    .in("venue_slug", slugs);
  if (error) {
    // The view arrives with 0014; degrade to "no rating" rather than fail.
    console.error("[venues] rating summary failed:", error.message);
    return new Map();
  }
  return new Map(
    ((data ?? []) as RatingRow[]).map((r) => [
      r.venue_slug,
      {
        average: r.average_rating === null ? null : Number(r.average_rating),
        count: r.review_count ?? 0,
      },
    ]),
  );
}

function withDefaults(
  row: Record<string, unknown>,
): Omit<Venue, "average_rating" | "review_count"> {
  return {
    slug: row["slug"] as string,
    name: row["name"] as string,
    description: row["description"] as string,
    image_url: (row["image_url"] as string | null) ?? null,
    location_url: (row["location_url"] as string | null) ?? null,
    address: (row["address"] as string | null) ?? null,
    phone: (row["phone"] as string | null) ?? null,
    category: (row["category"] as string | null) ?? "cafe",
    price_band: (row["price_band"] as number | null) ?? 2,
    opens_at: (row["opens_at"] as string | null) ?? "18:00",
    closes_at: (row["closes_at"] as string | null) ?? "23:00",
    slot_minutes: (row["slot_minutes"] as number | null) ?? 60,
    min_age: row["min_age"] as number,
    max_age: row["max_age"] as number,
    capacity: row["capacity"] as number,
  };
}

/**
 * Active venues with their rating aggregate. Readable by anon too (the
 * "venues: public read active" policy), which the landing page relies on.
 */
export const fetchVenues = createServerFn({ method: "GET" }).handler(
  async (): Promise<Venue[]> => {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("venues")
      .select(VENUE_COLUMNS)
      .eq("is_active", true)
      .order("name");

    if (error) {
      console.error("[venues] fetchVenues failed:", error.message);
      throw new Error("Could not load venues");
    }
    const rows = (data ?? []) as Record<string, unknown>[];
    const ratings = await loadRatings(
      supabase,
      rows.map((r) => r["slug"] as string),
    );
    return rows.map((r) => {
      const base = withDefaults(r);
      const rating = ratings.get(base.slug);
      return {
        ...base,
        average_rating: rating?.average ?? null,
        review_count: rating?.count ?? 0,
      };
    });
  },
);

const slugSchema = z.object({ slug: z.string().min(1).max(120) });

export const fetchVenue = createServerFn({ method: "GET" })
  .validator((data: unknown) => slugSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();

    const [venueResult, locationsResult, reviewsResult, ratings] =
      await Promise.all([
        supabase
          .from("venues")
          .select(VENUE_COLUMNS)
          .eq("slug", data.slug)
          .maybeSingle(),
        supabase
          .from("venue_locations")
          .select("id, venue_slug, name, address, capacity")
          .eq("venue_slug", data.slug)
          .eq("is_active", true)
          .order("name"),
        // Newest 20 for display. Author names are hydrated below through
        // public_profiles: the previous `public_profiles(display_name)`
        // embed had no FK to resolve against and silently returned nothing.
        supabase
          .from("reviews")
          .select("id, rating, comment, created_at, user_id")
          .eq("venue_slug", data.slug)
          .eq("is_hidden", false)
          .order("created_at", { ascending: false })
          .limit(20),
        loadRatings(supabase, [data.slug]),
      ]);

    if (venueResult.error) {
      console.error("[venues] fetchVenue failed:", venueResult.error.message);
      throw new Error("Could not load this venue");
    }
    if (!venueResult.data) return null;

    if (reviewsResult.error) {
      console.error("[venues] reviews failed:", reviewsResult.error.message);
    }
    const rawReviews = (reviewsResult.data ?? []) as Array<{
      id: string;
      rating: number;
      comment: string | null;
      created_at: string;
      user_id: string;
    }>;
    const profiles = await loadProfiles(
      supabase,
      rawReviews.map((r) => r.user_id),
    );
    const reviews: VenueReview[] = rawReviews.map((r) => {
      const profile = profiles.get(r.user_id);
      return {
        ...r,
        author_name: displayNameFor(profile),
        author_avatar: profile?.avatar_url ?? null,
      };
    });

    const rating = ratings.get(data.slug);
    const venue: Venue = {
      ...withDefaults(venueResult.data as Record<string, unknown>),
      average_rating: rating?.average ?? null,
      review_count: rating?.count ?? 0,
    };

    return {
      venue,
      locations: (locationsResult.data ?? []) as VenueLocation[],
      reviews,
      averageRating: venue.average_rating,
      reviewCount: venue.review_count,
    };
  });

const availabilitySchema = z.object({
  slug: z.string().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Live occupancy for a venue on a date, via the venue_availability() RPC. */
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
