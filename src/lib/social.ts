/**
 * src/lib/social.ts
 *
 * Data layer for the social graph (connections + presence check-ins).
 *
 * All writes go through the tables directly (RLS enforces the rules).
 * Social feed queries go through RPCs so the database can do the join
 * without exposing more data than needed to the client.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getCurrentUser, getSupabaseServerClient } from "./supabase/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Connection = {
  connection_id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  connected_at: string;
};

export type PendingRequest = {
  connection_id: string;
  requester_id: string;
  display_name: string | null;
  avatar_url: string | null;
  requested_at: string;
};

export type PresenceEntry = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  note: string | null;
  checkin_date: string;
};

export type ConnectionStatus =
  | "none"          // no relationship
  | "pending_sent"  // caller sent a request, not yet accepted
  | "pending_recv"  // caller received a request
  | "accepted"      // mutual connection
  | "declined";     // request was declined

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

/** All accepted connections for the signed-in user. */
export const fetchMyConnections = createServerFn({ method: "GET" }).handler(
  async (): Promise<Connection[]> => {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc("my_connections");
    if (error) {
      console.error("[social] my_connections failed:", error.message);
      return [];
    }
    return (data ?? []) as Connection[];
  },
);

/** Incoming connection requests not yet actioned. */
export const fetchPendingRequests = createServerFn({ method: "GET" }).handler(
  async (): Promise<PendingRequest[]> => {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc("pending_connection_requests");
    if (error) {
      console.error("[social] pending_connection_requests failed:", error.message);
      return [];
    }
    return (data ?? []) as PendingRequest[];
  },
);

/** Status of the connection between the caller and one other user. */
export const fetchConnectionStatus = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }): Promise<ConnectionStatus> => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return "none";

    const { data: row, error } = await supabase
      .from("connections")
      .select("requester_id, status")
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${data.userId}),` +
        `and(requester_id.eq.${data.userId},addressee_id.eq.${user.id})`,
      )
      .maybeSingle();

    if (error || !row) return "none";

    if (row.status === "accepted") return "accepted";
    if (row.status === "declined") return "declined";
    // pending — which direction?
    return row.requester_id === user.id ? "pending_sent" : "pending_recv";
  });

/** Send a connection request. */
export const sendConnectionRequest = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "Please sign in again." };

    const { error } = await supabase.from("connections").insert({
      requester_id: user.id,
      addressee_id: data.userId,
    });

    if (error) {
      if (/duplicate key|connections_unique_pair/i.test(error.message)) {
        return { ok: false as const, error: "Request already sent." };
      }
      if (/row-level security/i.test(error.message)) {
        return {
          ok: false as const,
          error: "Cannot connect with this person.",
        };
      }
      console.error("[social] sendConnectionRequest failed:", error.message);
      return { ok: false as const, error: "Could not send request." };
    }
    return { ok: true as const };
  });

/** Accept or decline an incoming request. */
export const respondToRequest = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        connectionId: z.string().uuid(),
        accept: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("connections")
      .update({ status: data.accept ? "accepted" : "declined" })
      .eq("id", data.connectionId);

    if (error) {
      console.error("[social] respondToRequest failed:", error.message);
      return { ok: false as const, error: "Could not update request." };
    }
    return { ok: true as const };
  });

/** Remove an existing connection or withdraw a pending request. */
export const removeConnection = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ connectionId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("connections")
      .delete()
      .eq("id", data.connectionId);

    if (error) {
      console.error("[social] removeConnection failed:", error.message);
      return { ok: false as const, error: "Could not remove connection." };
    }
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Presence check-ins
// ---------------------------------------------------------------------------

const checkinSchema = z.object({
  venueSlug: z.string().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(280).optional(),
});

/** Announce you're going to a venue on a date. */
export const checkInToVenue = createServerFn({ method: "POST" })
  .validator((data: unknown) => checkinSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "Please sign in again." };

    const { error } = await supabase.from("presence_checkins").upsert(
      {
        user_id: user.id,
        venue_slug: data.venueSlug,
        checkin_date: data.date,
        note: data.note ?? null,
      },
      { onConflict: "user_id,venue_slug,checkin_date" },
    );

    if (error) {
      console.error("[social] checkIn failed:", error.message);
      return { ok: false as const, error: "Could not check in." };
    }
    return { ok: true as const };
  });

/** Remove your check-in for a venue/date. */
export const checkOutFromVenue = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        venueSlug: z.string().min(1).max(120),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "Please sign in again." };

    const { error } = await supabase
      .from("presence_checkins")
      .delete()
      .eq("user_id", user.id)
      .eq("venue_slug", data.venueSlug)
      .eq("checkin_date", data.date);

    if (error) {
      console.error("[social] checkOut failed:", error.message);
      return { ok: false as const, error: "Could not remove check-in." };
    }
    return { ok: true as const };
  });

/** My own check-ins (upcoming + today). */
export const fetchMyCheckins = createServerFn({ method: "GET" }).handler(
  async () => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return [];

    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("presence_checkins")
      .select("id, venue_slug, checkin_date, note, venues(name, image_url)")
      .eq("user_id", user.id)
      .gte("checkin_date", today)
      .order("checkin_date");

    if (error) {
      console.error("[social] fetchMyCheckins failed:", error.message);
      return [];
    }
    return data ?? [];
  },
);

/** Who from your connections is going to a venue on a date. */
export const fetchVenueSocialFeed = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z
      .object({
        venueSlug: z.string().min(1).max(120),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<PresenceEntry[]> => {
    const supabase = getSupabaseServerClient();
    const { data: rows, error } = await supabase.rpc("venue_social_feed", {
      p_venue_slug: data.venueSlug,
      p_date: data.date,
    });

    if (error) {
      console.error("[social] venue_social_feed failed:", error.message);
      return [];
    }
    return (rows ?? []) as PresenceEntry[];
  });

// ---------------------------------------------------------------------------
// Profile repair
// ---------------------------------------------------------------------------

/**
 * Creates a profile row for the signed-in user when handle_new_user() did
 * not fire (e.g. admin accounts created before migrations ran).
 */
export const fixMissingProfile = createServerFn({ method: "POST" }).handler(
  async () => {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc("fix_missing_profile");
    if (error) {
      console.error("[social] fix_missing_profile failed:", error.message);
      return { ok: false as const, error: error.message };
    }
    return { ok: true as const, result: data as string };
  },
);
