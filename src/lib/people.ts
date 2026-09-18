import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getCurrentUser, getSupabaseServerClient } from "./supabase/server";

/**
 * The only shape of another member visible to a signed-in user, mirroring the
 * public_profiles view. Deliberately carries no email and no date of birth.
 */
export type PublicProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio?: string | null;
  interests?: string[];
  /** A human compared their photo with their avatar. Never self-set. */
  is_verified?: boolean;
};

/** A name to show when a profile is missing, suspended, or deleted. */
export function displayNameFor(
  profile: PublicProfile | undefined | null,
): string {
  return profile?.display_name?.trim() || "Member";
}

/** First letter for the fallback avatar. */
export function initialFor(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return (trimmed?.[0] ?? "M").toUpperCase();
}

/**
 * Resolve many ids to profiles in one round trip.
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

/** Escape PostgREST/ILIKE wildcards so a search for "%" is literal. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

const searchSchema = z.object({
  query: z.string().trim().min(2, "Type at least two characters").max(60),
});

/**
 * Find members by display name. Excludes the caller and anyone in a block
 * relationship with them. Over-fetches (60) before applying the block filter
 * so the page is not short when the caller has blocked several matches.
 */
export const searchPeople = createServerFn({ method: "GET" })
  .validator((data: unknown) => searchSchema.parse(data))
  .handler(async ({ data }): Promise<PublicProfile[]> => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return [];

    const [{ data: rows, error }, hidden] = await Promise.all([
      supabase
        .from("public_profiles")
        .select("id, display_name, avatar_url")
        .ilike("display_name", `%${escapeLike(data.query)}%`)
        .neq("id", user.id)
        .order("display_name")
        .limit(60),
      fetchBlockedIds(supabase),
    ]);

    if (error) {
      console.error("[people] searchPeople failed:", error.message);
      return [];
    }

    return ((rows ?? []) as PublicProfile[])
      .filter((p) => !hidden.has(p.id))
      .slice(0, 20);
  });

/**
 * Ids the caller cannot interact with, in either direction, via the
 * blocked_user_ids() RPC ("blocks: manage own" only shows one direction).
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

/* ── Public profile page ───────────────────────────────────────────────── */

export type MemberReview = {
  id: string;
  venue_slug: string;
  venue_name: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

export type MemberProfile = {
  profile: PublicProfile & { created_at: string | null };
  isMe: boolean;
  isBlocked: boolean;
  connection:
    | { status: "none" }
    | { status: "pending_sent"; id: string }
    | { status: "pending_recv"; id: string }
    | { status: "accepted"; id: string }
    | { status: "declined"; id: string };
  mutuals: PublicProfile[];
  reviews: MemberReview[];
  stats: { connections: number; reviews: number };
};

const userIdSchema = z.object({ userId: z.string().uuid() });

/** Everything the /people/$userId page needs, in one server round trip. */
export const fetchMemberProfile = createServerFn({ method: "GET" })
  .validator((data: unknown) => userIdSchema.parse(data))
  .handler(async ({ data }): Promise<MemberProfile | null> => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return null;

    const [profileRes, connRes, mutualRes, reviewsRes, countRes, blocked] =
      await Promise.all([
        supabase
          .from("public_profiles")
          .select(
            "id, display_name, avatar_url, bio, interests, is_verified, created_at",
          )
          .eq("id", data.userId)
          .maybeSingle(),
        supabase
          .from("connections")
          .select("id, requester_id, addressee_id, status")
          .or(
            `and(requester_id.eq.${user.id},addressee_id.eq.${data.userId}),and(requester_id.eq.${data.userId},addressee_id.eq.${user.id})`,
          )
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.rpc("mutual_connections", { p_other_id: data.userId }),
        supabase
          .from("reviews")
          .select("id, venue_slug, rating, comment, created_at, venues(name)")
          .eq("user_id", data.userId)
          .eq("is_hidden", false)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("connections")
          .select("id", { count: "exact", head: true })
          .eq("status", "accepted")
          .or(`requester_id.eq.${data.userId},addressee_id.eq.${data.userId}`),
        fetchBlockedIds(supabase),
      ]);

    if (profileRes.error || !profileRes.data) return null;
    const profile = profileRes.data as PublicProfile & {
      created_at: string | null;
    };

    let connection: MemberProfile["connection"] = { status: "none" };
    const c = connRes.data as {
      id: string;
      requester_id: string;
      addressee_id: string;
      status: string;
    } | null;
    if (c) {
      if (c.status === "accepted")
        connection = { status: "accepted", id: c.id };
      else if (c.status === "declined")
        connection = { status: "declined", id: c.id };
      else
        connection =
          c.requester_id === user.id
            ? { status: "pending_sent", id: c.id }
            : { status: "pending_recv", id: c.id };
    }

    const reviews: MemberReview[] = (
      (reviewsRes.data ?? []) as Array<{
        id: string;
        venue_slug: string;
        rating: number;
        comment: string | null;
        created_at: string;
        venues: { name: string } | { name: string }[] | null;
      }>
    ).map((r) => ({
      id: r.id,
      venue_slug: r.venue_slug,
      venue_name: Array.isArray(r.venues)
        ? (r.venues[0]?.name ?? r.venue_slug)
        : (r.venues?.name ?? r.venue_slug),
      rating: r.rating,
      comment: r.comment,
      created_at: r.created_at,
    }));

    return {
      profile,
      isMe: user.id === data.userId,
      isBlocked: blocked.has(data.userId),
      connection,
      mutuals: (
        (mutualRes.data ?? []) as Array<{
          user_id: string;
          display_name: string | null;
          avatar_url: string | null;
        }>
      ).map((m) => ({
        id: m.user_id,
        display_name: m.display_name,
        avatar_url: m.avatar_url,
      })),
      reviews,
      // The connections count is only visible for rows RLS lets us read
      // (ours); for other members it reflects shared visibility, so fall
      // back to mutuals when zero.
      stats: {
        connections: countRes.count ?? 0,
        reviews: reviews.length,
      },
    };
  });
