import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  getCurrentUser,
  getSupabaseServerClient,
  isAdminUser,
} from "./supabase/server";

/**
 * Every function here re-checks admin status server-side.
 *
 * The route guard is not the security boundary — RLS is. These checks exist so
 * a non-admin gets a clean error instead of an empty list, and so the intent
 * is explicit at the call site. Even if all of this were bypassed, the
 * database policies still refuse the rows.
 */
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !isAdminUser(user)) {
    throw new Error("Not authorised");
  }
  return user;
}

export const fetchAdminOverview = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAdmin();
    const supabase = getSupabaseServerClient();

    const [bookings, openReports, profiles, venues] = await Promise.all([
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("status", "confirmed"),
      supabase
        .from("reports")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "reviewing"]),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      // `slug`, not `id`: public.venues is keyed by slug and has no id column,
      // so selecting id errored and this tile silently always read zero.
      supabase.from("venues").select("slug", { count: "exact", head: true }),
    ]);

    // A count query that errors returns count: null, which `?? 0` renders as
    // a plausible-looking zero. Log it so a broken tile is visible rather
    // than quietly wrong.
    for (const [label, result] of [
      ["bookings", bookings],
      ["reports", openReports],
      ["profiles", profiles],
      ["venues", venues],
    ] as const) {
      if (result.error) {
        console.error(
          `[admin] overview count failed for ${label}:`,
          result.error.message,
        );
      }
    }

    return {
      confirmedBookings: bookings.count ?? 0,
      openReports: openReports.count ?? 0,
      members: profiles.count ?? 0,
      venues: venues.count ?? 0,
    };
  },
);

export type AdminReport = {
  id: string;
  reason: string;
  description: string | null;
  status: string;
  created_at: string;
  reported_user_id: string | null;
  venue_slug: string | null;
  reportedUserLabel: string | null;
  venueName: string | null;
};

/**
 * Enriches the raw queue with a human-readable label for who/what is being
 * reported. Without this an admin sees only a reason and a raw uuid/slug —
 * queries `profiles` directly (not `public_profiles`) because "profiles:
 * admin reads all" grants the admin every column, including a suspended
 * reported user's, which public_profiles deliberately hides from everyone
 * else.
 */
export const fetchReportQueue = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminReport[]> => {
    await requireAdmin();
    const supabase = getSupabaseServerClient();

    const { data, error } = await supabase
      .from("reports")
      .select(
        "id, reason, description, status, created_at, reported_user_id, venue_slug",
      )
      .in("status", ["open", "reviewing"])
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) {
      console.error("[admin] report queue failed:", error.message);
      return [];
    }
    const reports = data ?? [];

    const userIds = [
      ...new Set(
        reports
          .map((r) => r.reported_user_id)
          .filter((id): id is string => id !== null),
      ),
    ];
    const venueSlugs = [
      ...new Set(
        reports
          .map((r) => r.venue_slug)
          .filter((slug): slug is string => slug !== null),
      ),
    ];

    const [profilesResult, venuesResult] = await Promise.all([
      userIds.length > 0
        ? supabase
            .from("profiles")
            .select("id, display_name, email")
            .in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
      venueSlugs.length > 0
        ? supabase.from("venues").select("slug, name").in("slug", venueSlugs)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (profilesResult.error) {
      console.error(
        "[admin] report queue profile lookup failed:",
        profilesResult.error.message,
      );
    }
    if (venuesResult.error) {
      console.error(
        "[admin] report queue venue lookup failed:",
        venuesResult.error.message,
      );
    }

    const profileMap = new Map(
      (profilesResult.data ?? []).map((p) => [p["id"], p]),
    );
    const venueMap = new Map(
      (venuesResult.data ?? []).map((v) => [v["slug"], v]),
    );

    return reports.map((r) => {
      const profile = r.reported_user_id
        ? profileMap.get(r.reported_user_id)
        : undefined;
      const venue = r.venue_slug ? venueMap.get(r.venue_slug) : undefined;

      return {
        ...r,
        reportedUserLabel: r.reported_user_id
          ? (profile?.["display_name"] ??
            profile?.["email"] ??
            "Unknown member")
          : null,
        venueName: r.venue_slug ? (venue?.["name"] ?? r.venue_slug) : null,
      };
    });
  },
);

const resolveSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["reviewing", "actioned", "dismissed"]),
  note: z.string().trim().max(2000).optional(),
});

export const resolveReport = createServerFn({ method: "POST" })
  .validator((data: unknown) => resolveSchema.parse(data))
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    const supabase = getSupabaseServerClient();

    const { error } = await supabase
      .from("reports")
      .update({
        status: data.status,
        resolution_note: data.note ?? null,
        resolved_by: admin.id,
        resolved_at:
          data.status === "reviewing" ? null : new Date().toISOString(),
      })
      .eq("id", data.id);

    if (error) {
      console.error("[admin] resolveReport failed:", error.message);
      return { ok: false as const, error: "Could not update that report." };
    }

    // Append-only audit trail. audit_log has no update or delete policy for
    // anyone, admins included.
    await supabase.from("audit_log").insert({
      actor_id: admin.id,
      action: `report.${data.status}`,
      target_type: "report",
      target_id: data.id,
      detail: data.note ? { note: data.note } : {},
    });

    return { ok: true as const };
  });

/**
 * Donations awaiting a decision.
 *
 * "donations: admin manages" is what allows this to read across users;
 * a normal account only ever sees its own rows.
 */
export const fetchPendingDonations = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAdmin();
    const supabase = getSupabaseServerClient();

    const { data, error } = await supabase
      .from("donations")
      .select(
        "id, amount_minor, currency, method, status, message, donor_email, created_at",
      )
      .in("status", ["pending"])
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      console.error("[admin] fetchPendingDonations failed:", error.message);
      return [];
    }
    return data ?? [];
  },
);

const donationDecisionSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["confirmed", "failed", "refunded"]),
});

/**
 * Confirm that money actually arrived, or mark the declaration failed.
 *
 * Without this a donation declared by a user stays 'pending' forever: the
 * "donations: declare own" policy pins user inserts to pending, so only an
 * admin or a service-role webhook can move it on.
 */
export const setDonationStatus = createServerFn({ method: "POST" })
  .validator((data: unknown) => donationDecisionSchema.parse(data))
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    const supabase = getSupabaseServerClient();

    const { error } = await supabase
      .from("donations")
      .update({ status: data.status })
      .eq("id", data.id);

    if (error) {
      console.error("[admin] setDonationStatus failed:", error.message);
      return { ok: false as const, error: "Could not update that donation." };
    }

    // Money decisions are exactly what an append-only audit trail is for.
    await supabase.from("audit_log").insert({
      actor_id: admin.id,
      action: `donation.${data.status}`,
      target_type: "donation",
      target_id: data.id,
      detail: {},
    });

    return { ok: true as const };
  });

const suspendSchema = z.object({
  userId: z.string().uuid(),
  suspended: z.boolean(),
});

/**
 * Suspends or reinstates a member. "profiles: admin updates all" (0002) is
 * the only thing that authorises this write; without an admin action that
 * uses it, a report could be "actioned" with no actual consequence for the
 * reported member. A suspended member disappears from public_profiles
 * (0010) and is blocked from booking by book_venue() (0004).
 */
export const setUserSuspended = createServerFn({ method: "POST" })
  .validator((data: unknown) => suspendSchema.parse(data))
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    const supabase = getSupabaseServerClient();

    const { error } = await supabase
      .from("profiles")
      .update({ is_suspended: data.suspended })
      .eq("id", data.userId);

    if (error) {
      console.error("[admin] setUserSuspended failed:", error.message);
      return { ok: false as const, error: "Could not update that member." };
    }

    await supabase.from("audit_log").insert({
      actor_id: admin.id,
      action: data.suspended ? "user.suspend" : "user.unsuspend",
      target_type: "profile",
      target_id: data.userId,
      detail: {},
    });

    return { ok: true as const };
  });

/* ── Member list ────────────────────────────────────────────────────────── */

export type AdminMember = {
  id: string;
  display_name: string | null;
  email: string | null;
  date_of_birth: string;
  is_suspended: boolean;
  created_at: string;
};

export const fetchMembers = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ page: z.number().int().min(0).default(0) }).parse(data))
  .handler(async ({ data }): Promise<AdminMember[]> => {
    await requireAdmin();
    const supabase = getSupabaseServerClient();
    const PAGE = 50;
    const { data: rows, error } = await supabase
      .from("profiles")
      .select("id, display_name, email, date_of_birth, is_suspended, created_at")
      .order("created_at", { ascending: false })
      .range(data.page * PAGE, (data.page + 1) * PAGE - 1);

    if (error) {
      console.error("[admin] fetchMembers failed:", error.message);
      return [];
    }
    return (rows ?? []) as AdminMember[];
  });

/* ── Venue management ───────────────────────────────────────────────────── */

export type AdminVenue = {
  slug: string;
  name: string;
  description: string;
  image_url: string | null;
  location_url: string | null;
  min_age: number;
  max_age: number;
  capacity: number;
  is_active: boolean;
};

export const fetchAdminVenues = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminVenue[]> => {
    await requireAdmin();
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("venues")
      .select("slug, name, description, image_url, location_url, min_age, max_age, capacity, is_active")
      .order("name");
    if (error) {
      console.error("[admin] fetchAdminVenues failed:", error.message);
      return [];
    }
    return (data ?? []) as AdminVenue[];
  },
);

const venueUpsertSchema = z.object({
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, hyphens"),
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  image_url: z.string().url().nullable(),
  location_url: z.string().url().nullable(),
  min_age: z.number().int().min(18).max(99),
  max_age: z.number().int().min(18).max(99),
  capacity: z.number().int().min(1).max(10000),
});

export const upsertVenue = createServerFn({ method: "POST" })
  .validator((data: unknown) => venueUpsertSchema.parse(data))
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    const supabase = getSupabaseServerClient();

    const { error } = await supabase.from("venues").upsert({
      slug: data.slug,
      name: data.name,
      description: data.description,
      image_url: data.image_url,
      location_url: data.location_url,
      min_age: data.min_age,
      max_age: data.max_age,
      capacity: data.capacity,
    });

    if (error) {
      console.error("[admin] upsertVenue failed:", error.message);
      return { ok: false as const, error: "Could not save venue." };
    }

    await supabase.from("audit_log").insert({
      actor_id: admin.id,
      action: "venue.upsert",
      target_type: "venue",
      target_id: data.slug,
      detail: { name: data.name },
    });

    return { ok: true as const };
  });

const venueActivateSchema = z.object({
  slug: z.string().min(1).max(120),
  is_active: z.boolean(),
});

export const setVenueActive = createServerFn({ method: "POST" })
  .validator((data: unknown) => venueActivateSchema.parse(data))
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    const supabase = getSupabaseServerClient();

    const { error } = await supabase
      .from("venues")
      .update({ is_active: data.is_active })
      .eq("slug", data.slug);

    if (error) {
      console.error("[admin] setVenueActive failed:", error.message);
      return { ok: false as const, error: "Could not update venue." };
    }

    await supabase.from("audit_log").insert({
      actor_id: admin.id,
      action: data.is_active ? "venue.activate" : "venue.deactivate",
      target_type: "venue",
      target_id: data.slug,
      detail: {},
    });

    return { ok: true as const };
  });

/* ── Admin bookings ─────────────────────────────────────────────────────── */

export type AdminBooking = {
  id: string;
  venue_slug: string;
  booking_date: string;
  booking_time: string;
  party_size: number;
  status: "confirmed" | "cancelled" | "completed";
  created_at: string;
  user_email: string | null;
  user_name: string | null;
  venue_name: string | null;
};

export const fetchAdminBookings = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ page: z.number().int().min(0).default(0) }).parse(data))
  .handler(async ({ data }): Promise<AdminBooking[]> => {
    await requireAdmin();
    const supabase = getSupabaseServerClient();
    const PAGE = 50;

    // Fetch bookings with venue name (venues RLS allows admin reads)
    const { data: rows, error } = await supabase
      .from("bookings")
      .select(
        "id, user_id, venue_slug, booking_date, booking_time, party_size, status, created_at, venues(name)",
      )
      .order("booking_date", { ascending: false })
      .order("booking_time", { ascending: false })
      .range(data.page * PAGE, (data.page + 1) * PAGE - 1);

    if (error) {
      console.error("[admin] fetchAdminBookings failed:", error.message);
      return [];
    }

    const bookings = rows ?? [];

    // Separate profiles lookup — "profiles: admin reads all" covers this
    const userIds = [...new Set(bookings.map((b: Record<string, unknown>) => b["user_id"] as string))];
    const profilesResult = userIds.length > 0
      ? await supabase.from("profiles").select("id, display_name, email").in("id", userIds)
      : { data: [], error: null };

    if (profilesResult.error) {
      console.error("[admin] fetchAdminBookings profiles lookup failed:", profilesResult.error.message);
    }

    const profileMap = new Map(
      (profilesResult.data ?? []).map((p: Record<string, unknown>) => [p["id"] as string, p]),
    );

    return bookings.map((r: Record<string, unknown>) => {
      const profile = profileMap.get(r["user_id"] as string);
      return {
        id: r["id"] as string,
        venue_slug: r["venue_slug"] as string,
        booking_date: r["booking_date"] as string,
        booking_time: r["booking_time"] as string,
        party_size: r["party_size"] as number,
        status: r["status"] as AdminBooking["status"],
        created_at: r["created_at"] as string,
        venue_name: (r["venues"] as { name: string } | null)?.name ?? null,
        user_name: (profile?.["display_name"] as string | null) ?? null,
        user_email: (profile?.["email"] as string | null) ?? null,
      };
    });
  });

/* ── Audit log ──────────────────────────────────────────────────────────── */

export type AuditEntry = {
  id: string;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string;
  detail: Record<string, unknown>;
  created_at: string;
  actor_name: string | null;
};

export const fetchAuditLog = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ page: z.number().int().min(0).default(0) }).parse(data),
  )
  .handler(async ({ data }): Promise<AuditEntry[]> => {
    await requireAdmin();
    const supabase = getSupabaseServerClient();
    const PAGE = 50;

    const { data: rows, error } = await supabase
      .from("audit_log")
      .select(
        "id, actor_id, action, target_type, target_id, detail, created_at",
      )
      .order("created_at", { ascending: false })
      .range(data.page * PAGE, (data.page + 1) * PAGE - 1);

    if (error) {
      console.error("[admin] fetchAuditLog failed:", error.message);
      return [];
    }

    const entries = rows ?? [];
    const actorIds = [...new Set(entries.map((r) => r.actor_id as string))];
    const profilesResult =
      actorIds.length > 0
        ? await supabase
            .from("profiles")
            .select("id, display_name, email")
            .in("id", actorIds)
        : { data: [], error: null };

    const profileMap = new Map(
      (profilesResult.data ?? []).map((p) => [p["id"], p]),
    );

    return entries.map((r) => {
      const p = profileMap.get(r["actor_id"] as string);
      return {
        ...r,
        detail: (r.detail ?? {}) as Record<string, unknown>,
        actor_name:
          (p?.["display_name"] as string | null) ??
          (p?.["email"] as string | null) ??
          null,
      };
    });
  });

const bookingStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["confirmed", "cancelled", "completed"]),
});

export const setBookingStatus = createServerFn({ method: "POST" })
  .validator((data: unknown) => bookingStatusSchema.parse(data))
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    const supabase = getSupabaseServerClient();

    const { error } = await supabase
      .from("bookings")
      .update({ status: data.status })
      .eq("id", data.id);

    if (error) {
      console.error("[admin] setBookingStatus failed:", error.message);
      return { ok: false as const, error: "Could not update booking." };
    }

    await supabase.from("audit_log").insert({
      actor_id: admin.id,
      action: `booking.${data.status}`,
      target_type: "booking",
      target_id: data.id,
      detail: {},
    });

    return { ok: true as const };
  });
