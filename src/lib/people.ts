import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getCurrentUser, getSupabaseServerClient } from "./supabase/server";

/**
 * The only shape of another member visible to a signed-in user, mirroring the
 * public_profiles view in 0010_profile_visibility.sql. Deliberately carries
 * no email and no date of birth.
 */
export type PublicProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

/** A name to show when a profile is missing, suspended, or deleted. */
export function displayNameFor(profile: PublicProfile | undefined): string {
  return profile?.display_name?.trim() || "Member";
}

/**
 * Resolve many ids to profiles in one round trip.
 *
 * Message lists render dozens of rows from a handful of distinct authors, so
 * this de-duplicates first — the alternative is a query per message.
 * Suspended users are absent from the view, so they simply fall back to
 * "Member" rather than leaking a name.
 */
export async function loadProfiles(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  userIds: string[],
): Promise<Map<string, PublicProfile>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase
    .from("public_profiles")
    .select("id, display_name, avatar_url")
    .in("id", unique);

  if (error) {
    console.error("[people] loadProfiles failed:", error.message);
    return new Map();
  }
  return new Map((data ?? []).map((p) => [p.id as string, p as PublicProfile]));
}

const searchSchema = z.object({
  query: z.string().trim().min(2, "Type at least two characters").max(60),
});

/**
 * Find members by display name, to start a conversation with.
 *
 * Excludes the caller, and anyone either party has blocked — a blocked user
 * should not be reachable through search in the first place.
 */
export const searchPeople = createServerFn({ method: "GET" })
  .validator((data: unknown) => searchSchema.parse(data))
  .handler(async ({ data }): Promise<PublicProfile[]> => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return [];

    const { data: rows, error } = await supabase
      .from("public_profiles")
      .select("id, display_name, avatar_url")
      .ilike("display_name", `%${data.query}%`)
      .neq("id", user.id)
      .order("display_name")
      .limit(20);

    if (error) {
      console.error("[people] searchPeople failed:", error.message);
      return [];
    }

    const hidden = await fetchBlockedIds(supabase);
    return (rows ?? []).filter(
      (p) => !hidden.has(p.id as string),
    ) as PublicProfile[];
  });

/**
 * Ids the caller cannot interact with, in either direction.
 *
 * Goes through the blocked_user_ids() RPC rather than querying `blocks`
 * directly: "blocks: manage own" would return only the people the caller
 * blocked, missing everyone who blocked the caller.
 */
export async function fetchBlockedIds(
  supabase: ReturnType<typeof getSupabaseServerClient>,
): Promise<Set<string>> {
  const { data, error } = await supabase.rpc("blocked_user_ids");
  if (error) {
    console.error("[people] blocked_user_ids failed:", error.message);
    return new Set();
  }
  return new Set((data ?? []) as string[]);
}
