import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { fetchMeetups, type MeetupSummary } from "./meetups";
import { escapeLike, fetchBlockedIds, type PublicProfile } from "./people";
import { getCurrentUser, getSupabaseServerClient } from "./supabase/server";
import { categoryLabel } from "./venue-filters";
import { fetchVenues, type Venue } from "./venues";

/**
 * One search box over everything a member might be looking for: a venue by
 * name or category, a person by name or interest, a meetup by title or venue.
 *
 * Venues and meetups are few enough to fetch and filter here; people go
 * through a database ILIKE because the member table is the one that grows.
 */

export type SearchResults = {
  query: string;
  venues: Venue[];
  people: PublicProfile[];
  meetups: MeetupSummary[];
};

const schema = z.object({
  query: z.string().trim().min(1).max(60),
});

function matches(haystack: Array<string | null | undefined>, needle: string) {
  const n = needle.toLowerCase();
  return haystack.some((h) => h?.toLowerCase().includes(n));
}

export const searchAll = createServerFn({ method: "GET" })
  .validator((data: unknown) => schema.parse(data))
  .handler(async ({ data }): Promise<SearchResults> => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    const empty = { query: data.query, venues: [], people: [], meetups: [] };
    if (!user) return empty;

    const q = data.query;
    const pattern = `%${escapeLike(q)}%`;

    const [venues, meetups, peopleByName, peopleByInterest, hidden] =
      await Promise.all([
        fetchVenues(),
        fetchMeetups({ data: { scope: "upcoming" } }),
        supabase
          .from("public_profiles")
          .select("id, display_name, avatar_url, interests, is_verified")
          .ilike("display_name", pattern)
          .neq("id", user.id)
          .order("display_name")
          .limit(40),
        // An interest typed as a word ("football") finds the people who list it.
        supabase
          .from("public_profiles")
          .select("id, display_name, avatar_url, interests, is_verified")
          .contains("interests", [q.toLowerCase().replace(/\s+/g, "-")])
          .neq("id", user.id)
          .limit(40),
        fetchBlockedIds(supabase),
      ]);

    const seen = new Set<string>();
    const people = [
      ...((peopleByName.data ?? []) as PublicProfile[]),
      ...((peopleByInterest.data ?? []) as PublicProfile[]),
    ].filter((p) => {
      if (hidden.has(p.id) || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    return {
      query: q,
      venues: venues
        .filter((v) =>
          matches(
            [
              v.name,
              v.category,
              v.address,
              v.description,
              categoryLabel(v.category),
            ],
            q,
          ),
        )
        .slice(0, 12),
      people: people.slice(0, 20),
      meetups: meetups
        .filter((m) =>
          matches([m.title, m.description, m.venue_name, m.host_name], q),
        )
        .slice(0, 12),
    };
  });
