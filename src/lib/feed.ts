import { createServerFn } from "@tanstack/react-start";

import { sharedInterests } from "./profile";
import { getCurrentUser, getSupabaseServerClient } from "./supabase/server";

/**
 * The signed-in home: what is happening in Tirana, and who you might go with.
 *
 * Three strands, assembled from tables that already exist rather than a new
 * one — a feed that stores its own rows goes stale the moment anything it
 * copied changes:
 *
 *   1. meetups you could join tonight and this week,
 *   2. connections who have checked in somewhere,
 *   3. members who share your interests and are not connected to you yet.
 */

export type FeedCheckin = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  venue_slug: string;
  venue_name: string | null;
  checkin_date: string;
  note: string | null;
};

export type SuggestedPerson = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  shared: string[];
};

export type FeedData = {
  today: string;
  myInterests: string[];
  /** Accepted connections, for ranking meetups by who else is going. */
  connectionIds: string[];
  /** Favourited venue slugs, for ranking meetups by where they are. */
  favouriteSlugs: string[];
  connectionCheckins: FeedCheckin[];
  suggested: SuggestedPerson[];
};

/** Today's date in Tirana, matching how bookings and meetups are compared. */
export function todayInTiranaIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Tirane" });
}

export const fetchFeed = createServerFn({ method: "GET" }).handler(
  async (): Promise<FeedData> => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    const today = todayInTiranaIso();

    const empty: FeedData = {
      today,
      myInterests: [],
      connectionIds: [],
      favouriteSlugs: [],
      connectionCheckins: [],
      suggested: [],
    };
    if (!user) return empty;

    const { data: me } = await supabase
      .from("profiles")
      .select("interests")
      .eq("id", user.id)
      .maybeSingle();
    const myInterests = ((me as { interests?: string[] } | null)?.interests ??
      []) as string[];

    // Accepted connections, in both directions — `connections` stores one row
    // per pair and either side may have sent it.
    const { data: connectionRows } = await supabase
      .from("connections")
      .select("requester_id, addressee_id")
      .eq("status", "accepted");

    const connectionIds = (
      (connectionRows ?? []) as Array<Record<string, string>>
    )
      .map((row) =>
        row["requester_id"] === user.id
          ? row["addressee_id"]
          : row["requester_id"],
      )
      .filter((id): id is string => Boolean(id) && id !== user.id);

    const [checkinResult, suggestedResult, favouriteResult] = await Promise.all(
      [
        connectionIds.length > 0
          ? supabase
              .from("presence_checkins")
              .select("user_id, venue_slug, checkin_date, note")
              .in("user_id", connectionIds)
              .gte("checkin_date", today)
              .order("checkin_date", { ascending: true })
              .limit(30)
          : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
        // `overlaps` is the array && operator, which is what the GIN index on
        // profiles.interests (0019) exists to serve.
        myInterests.length > 0
          ? supabase
              .from("public_profiles")
              .select("id, display_name, avatar_url, interests, is_verified")
              .overlaps("interests", myInterests)
              .limit(40)
          : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
        // "favorites: manage own" scopes this to the caller.
        supabase.from("favorites").select("venue_slug"),
      ],
    );

    const checkinRows = (checkinResult.data ?? []) as Array<
      Record<string, unknown>
    >;
    const slugs = [
      ...new Set(checkinRows.map((row) => row["venue_slug"] as string)),
    ];

    const [profiles, venues] = await Promise.all([
      connectionIds.length > 0
        ? supabase
            .from("public_profiles")
            .select("id, display_name, avatar_url")
            .in("id", connectionIds)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
      slugs.length > 0
        ? supabase.from("venues").select("slug, name").in("slug", slugs)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    ]);

    const profileById = new Map(
      ((profiles.data ?? []) as Array<Record<string, unknown>>).map((p) => [
        p["id"] as string,
        p,
      ]),
    );
    const venueBySlug = new Map(
      ((venues.data ?? []) as Array<Record<string, unknown>>).map((v) => [
        v["slug"] as string,
        v["name"] as string,
      ]),
    );

    const connected = new Set(connectionIds);

    return {
      today,
      myInterests,
      connectionIds,
      favouriteSlugs: (
        (favouriteResult.data ?? []) as Array<Record<string, unknown>>
      ).map((f) => f["venue_slug"] as string),
      connectionCheckins: checkinRows.map((row) => {
        const userId = row["user_id"] as string;
        const profile = profileById.get(userId);
        return {
          user_id: userId,
          display_name: (profile?.["display_name"] as string | null) ?? null,
          avatar_url: (profile?.["avatar_url"] as string | null) ?? null,
          venue_slug: row["venue_slug"] as string,
          venue_name: venueBySlug.get(row["venue_slug"] as string) ?? null,
          checkin_date: row["checkin_date"] as string,
          note: (row["note"] as string | null) ?? null,
        };
      }),
      suggested: (
        (suggestedResult.data ?? []) as Array<Record<string, unknown>>
      )
        // Suggesting yourself, or somebody you already know, is noise. Blocked
        // members are already absent — public_profiles hides suspended
        // accounts and RLS filters blocks.
        .filter(
          (row) => row["id"] !== user.id && !connected.has(row["id"] as string),
        )
        .map((row) => ({
          id: row["id"] as string,
          display_name: (row["display_name"] as string | null) ?? null,
          avatar_url: (row["avatar_url"] as string | null) ?? null,
          is_verified: Boolean(row["is_verified"]),
          shared: sharedInterests(myInterests, row["interests"] as string[]),
        }))
        // Most in common first — that is the whole reason to show the list.
        .sort((a, b) => b.shared.length - a.shared.length)
        .slice(0, 12),
    };
  },
);
