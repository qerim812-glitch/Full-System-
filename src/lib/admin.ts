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

/**
 * Append-only audit trail. audit_log has no update or delete policy for
 * anyone, admins included. A failed insert used to vanish silently; it is
 * now logged so a broken trail is visible in the server logs.
 */
async function audit(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  detail: Record<string, string | number | boolean | null> = {},
) {
  const { error } = await supabase.from("audit_log").insert({
    actor_id: actorId,
    action,
    target_type: targetType,
    target_id: targetId,
    detail,
  });
  if (error)
    console.error(`[admin] audit insert failed (${action}):`, error.message);
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

    const { data: rows, error } = await supabase
      .from("reports")
      .update({
        status: data.status,
        resolution_note: data.note ?? null,
        resolved_by: admin.id,
        resolved_at:
          data.status === "reviewing" ? null : new Date().toISOString(),
      })
      .eq("id", data.id)
      .select("id");

    if (error) {
      console.error("[admin] resolveReport failed:", error.message);
      return { ok: false as const, error: "Could not update that report." };
    }
    if (!rows || rows.length === 0) {
      return { ok: false as const, error: "That report no longer exists." };
    }

    await audit(
      supabase,
      admin.id,
      `report.${data.status}`,
      "report",
      data.id,
      data.note ? { note: data.note } : {},
    );

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

    if (data.userId === admin.id) {
      return {
        ok: false as const,
        error: "You cannot suspend your own account.",
      };
    }

    const { data: rows, error } = await supabase
      .from("profiles")
      .update({ is_suspended: data.suspended })
      .eq("id", data.userId)
      .select("id");

    if (error) {
      console.error("[admin] setUserSuspended failed:", error.message);
      return { ok: false as const, error: "Could not update that member." };
    }
    if (!rows || rows.length === 0) {
      return { ok: false as const, error: "Member not found." };
    }

    await audit(
      supabase,
      admin.id,
      data.suspended ? "user.suspend" : "user.unsuspend",
      "profile",
      data.userId,
    );

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
  .validator((data: unknown) =>
    z.object({ page: z.number().int().min(0).default(0) }).parse(data),
  )
  .handler(async ({ data }): Promise<AdminMember[]> => {
    await requireAdmin();
    const supabase = getSupabaseServerClient();
    const PAGE = 50;
    const { data: rows, error } = await supabase
      .from("profiles")
      .select(
        "id, display_name, email, date_of_birth, is_suspended, created_at",
      )
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
  is_active: boolean;
};

const ADMIN_VENUE_COLUMNS =
  "slug, name, description, image_url, location_url, address, phone, category, price_band, opens_at, closes_at, slot_minutes, min_age, max_age, capacity, is_active";

export const fetchAdminVenues = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminVenue[]> => {
    await requireAdmin();
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("venues")
      .select(ADMIN_VENUE_COLUMNS)
      .order("name");
    if (error) {
      console.error("[admin] fetchAdminVenues failed:", error.message);
      return [];
    }
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      ...(r as unknown as AdminVenue),
      address: (r["address"] as string | null) ?? null,
      phone: (r["phone"] as string | null) ?? null,
      category: (r["category"] as string | null) ?? "cafe",
      price_band: (r["price_band"] as number | null) ?? 2,
      opens_at: ((r["opens_at"] as string | null) ?? "18:00").slice(0, 5),
      closes_at: ((r["closes_at"] as string | null) ?? "23:00").slice(0, 5),
      slot_minutes: (r["slot_minutes"] as number | null) ?? 60,
    }));
  },
);

const timeField = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM");

export const venueUpsertSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .max(120)
      .regex(
        /^[a-z0-9-]+$/,
        "slug must be lowercase letters, numbers, hyphens",
      ),
    name: z.string().min(1).max(200),
    description: z.string().min(1).max(2000),
    image_url: z.string().url().nullable(),
    location_url: z.string().url().nullable(),
    address: z.string().trim().max(300).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    category: z
      .enum(["cafe", "lounge", "bar", "restaurant", "club", "garden"])
      .default("cafe"),
    price_band: z.number().int().min(1).max(4).default(2),
    opens_at: timeField.default("18:00"),
    closes_at: timeField.default("23:00"),
    slot_minutes: z
      .union([z.literal(30), z.literal(60), z.literal(90), z.literal(120)])
      .default(60),
    min_age: z.number().int().min(18).max(99),
    max_age: z.number().int().min(18).max(99),
    capacity: z.number().int().min(1).max(10000),
  })
  .refine((v) => v.max_age >= v.min_age, {
    message: "Maximum age must be at least the minimum age",
    path: ["max_age"],
  })
  .refine((v) => v.closes_at > v.opens_at, {
    message: "Closing time must be after opening time",
    path: ["closes_at"],
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
      address: data.address ?? null,
      phone: data.phone ?? null,
      category: data.category,
      price_band: data.price_band,
      opens_at: data.opens_at,
      closes_at: data.closes_at,
      slot_minutes: data.slot_minutes,
      min_age: data.min_age,
      max_age: data.max_age,
      capacity: data.capacity,
    });

    if (error) {
      console.error("[admin] upsertVenue failed:", error.message);
      if (/column .* does not exist/i.test(error.message)) {
        return {
          ok: false as const,
          error: "Run migration 0014 first (new venue columns).",
        };
      }
      return { ok: false as const, error: "Could not save venue." };
    }

    await audit(supabase, admin.id, "venue.upsert", "venue", data.slug, {
      name: data.name,
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

    const { data: rows, error } = await supabase
      .from("venues")
      .update({ is_active: data.is_active })
      .eq("slug", data.slug)
      .select("slug");

    if (error) {
      console.error("[admin] setVenueActive failed:", error.message);
      return { ok: false as const, error: "Could not update venue." };
    }
    if (!rows || rows.length === 0) {
      return { ok: false as const, error: "Venue not found." };
    }

    await audit(
      supabase,
      admin.id,
      data.is_active ? "venue.activate" : "venue.deactivate",
      "venue",
      data.slug,
    );

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
  .validator((data: unknown) =>
    z.object({ page: z.number().int().min(0).default(0) }).parse(data),
  )
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
    const userIds = [
      ...new Set(
        bookings.map((b: Record<string, unknown>) => b["user_id"] as string),
      ),
    ];
    const profilesResult =
      userIds.length > 0
        ? await supabase
            .from("profiles")
            .select("id, display_name, email")
            .in("id", userIds)
        : { data: [], error: null };

    if (profilesResult.error) {
      console.error(
        "[admin] fetchAdminBookings profiles lookup failed:",
        profilesResult.error.message,
      );
    }

    const profileMap = new Map(
      (profilesResult.data ?? []).map((p: Record<string, unknown>) => [
        p["id"] as string,
        p,
      ]),
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
  /** JSON-encoded detail payload. Kept as a string so the server-function
   *  serializer does not have to reason about an open-ended object shape. */
  detail: string;
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
        id: String(r.id),
        actor_id: (r.actor_id as string | null) ?? "",
        action: r.action as string,
        target_type: (r.target_type as string | null) ?? "",
        target_id: (r.target_id as string | null) ?? "",
        created_at: r.created_at as string,
        detail: JSON.stringify(r.detail ?? {}),
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

    const { data: rows, error } = await supabase
      .from("bookings")
      .update({ status: data.status })
      .eq("id", data.id)
      .select("id");

    if (error) {
      console.error("[admin] setBookingStatus failed:", error.message);
      return { ok: false as const, error: "Could not update booking." };
    }
    if (!rows || rows.length === 0) {
      return { ok: false as const, error: "Booking not found." };
    }

    await audit(
      supabase,
      admin.id,
      `booking.${data.status}`,
      "booking",
      data.id,
    );

    return { ok: true as const };
  });

/* ── Venue locations (branches) ─────────────────────────────────────────── */

export type AdminLocation = {
  id: string;
  venue_slug: string;
  name: string;
  address: string | null;
  capacity: number | null;
  is_active: boolean;
};

export const fetchAdminLocations = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ venueSlug: z.string().min(1).max(120) }).parse(data),
  )
  .handler(async ({ data }): Promise<AdminLocation[]> => {
    await requireAdmin();
    const supabase = getSupabaseServerClient();
    const { data: rows, error } = await supabase
      .from("venue_locations")
      .select("id, venue_slug, name, address, capacity, is_active")
      .eq("venue_slug", data.venueSlug)
      .order("name");
    if (error) {
      console.error("[admin] fetchAdminLocations failed:", error.message);
      return [];
    }
    return ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r["id"] as string,
      venue_slug: r["venue_slug"] as string,
      name: r["name"] as string,
      address: (r["address"] as string | null) ?? null,
      capacity: (r["capacity"] as number | null) ?? null,
      is_active: r["is_active"] as boolean,
    }));
  });

const locationUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  venueSlug: z.string().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(300).nullable().optional(),
  capacity: z.number().int().min(1).max(10000).nullable().optional(),
  is_active: z.boolean().default(true),
});

export const upsertLocation = createServerFn({ method: "POST" })
  .validator((data: unknown) => locationUpsertSchema.parse(data))
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    const supabase = getSupabaseServerClient();
    const row = {
      venue_slug: data.venueSlug,
      name: data.name,
      address: data.address ?? null,
      capacity: data.capacity ?? null,
      is_active: data.is_active,
    };
    const query = data.id
      ? supabase
          .from("venue_locations")
          .update(row)
          .eq("id", data.id)
          .select("id")
      : supabase.from("venue_locations").insert(row).select("id");
    const { data: rows, error } = await query;
    if (error) {
      console.error("[admin] upsertLocation failed:", error.message);
      if (
        /duplicate key|venue_locations_venue_slug_name_key/i.test(error.message)
      ) {
        return {
          ok: false as const,
          error: "A branch with that name already exists.",
        };
      }
      return { ok: false as const, error: "Could not save the branch." };
    }
    const id = (rows?.[0] as { id: string } | undefined)?.id ?? data.id ?? "";
    await audit(
      supabase,
      admin.id,
      data.id ? "location.update" : "location.create",
      "venue_location",
      id,
      { venue: data.venueSlug, name: data.name },
    );
    return { ok: true as const, id };
  });

export const deleteLocation = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    const supabase = getSupabaseServerClient();
    // Branches with bookings are deactivated instead of deleted so history
    // keeps resolving; the FK from bookings.location_id has no cascade.
    const { count } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("location_id", data.id);
    if ((count ?? 0) > 0) {
      const { error } = await supabase
        .from("venue_locations")
        .update({ is_active: false })
        .eq("id", data.id);
      if (error)
        return {
          ok: false as const,
          error: "Could not deactivate the branch.",
        };
      await audit(
        supabase,
        admin.id,
        "location.deactivate",
        "venue_location",
        data.id,
      );
      return { ok: true as const, deactivated: true };
    }
    const { error } = await supabase
      .from("venue_locations")
      .delete()
      .eq("id", data.id);
    if (error) {
      console.error("[admin] deleteLocation failed:", error.message);
      return { ok: false as const, error: "Could not delete the branch." };
    }
    await audit(
      supabase,
      admin.id,
      "location.delete",
      "venue_location",
      data.id,
    );
    return { ok: true as const, deactivated: false };
  });

/* ── Content moderation (reviews + venue chat) ──────────────────────────── */

export type ModerationItem = {
  kind: "review" | "chat";
  id: string;
  venue_slug: string;
  venue_name: string | null;
  author_name: string | null;
  author_email: string | null;
  body: string | null;
  rating: number | null;
  is_hidden: boolean;
  created_at: string;
};

/** Latest reviews and chat messages across venues, hidden ones included. */
export const fetchModerationFeed = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ venueSlug: z.string().max(120).optional() }).parse(data),
  )
  .handler(async ({ data }): Promise<ModerationItem[]> => {
    await requireAdmin();
    const supabase = getSupabaseServerClient();

    let reviewsQ = supabase
      .from("reviews")
      .select("id, venue_slug, user_id, rating, comment, is_hidden, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    let chatQ = supabase
      .from("chat_messages")
      .select("id, venue_slug, user_id, body, is_hidden, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.venueSlug) {
      reviewsQ = reviewsQ.eq("venue_slug", data.venueSlug);
      chatQ = chatQ.eq("venue_slug", data.venueSlug);
    }
    const [reviews, chat, venues] = await Promise.all([
      reviewsQ,
      chatQ,
      supabase.from("venues").select("slug, name"),
    ]);
    if (reviews.error)
      console.error("[admin] moderation reviews:", reviews.error.message);
    if (chat.error)
      console.error("[admin] moderation chat:", chat.error.message);

    const venueName = new Map(
      ((venues.data ?? []) as Array<{ slug: string; name: string }>).map(
        (v) => [v.slug, v.name],
      ),
    );
    const rows: Array<Record<string, unknown> & { kind: "review" | "chat" }> = [
      ...((reviews.data ?? []) as Record<string, unknown>[]).map((r) => ({
        ...r,
        kind: "review" as const,
      })),
      ...((chat.data ?? []) as Record<string, unknown>[]).map((r) => ({
        ...r,
        kind: "chat" as const,
      })),
    ];
    const userIds = [...new Set(rows.map((r) => r["user_id"] as string))];
    const profiles = userIds.length
      ? await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", userIds)
      : { data: [] as Record<string, unknown>[] };
    const profileMap = new Map(
      ((profiles.data ?? []) as Record<string, unknown>[]).map((p) => [
        p["id"] as string,
        p,
      ]),
    );

    return rows
      .map((r) => {
        const p = profileMap.get(r["user_id"] as string);
        return {
          kind: r.kind,
          id: String(r["id"]),
          venue_slug: r["venue_slug"] as string,
          venue_name: venueName.get(r["venue_slug"] as string) ?? null,
          author_name: (p?.["display_name"] as string | null) ?? null,
          author_email: (p?.["email"] as string | null) ?? null,
          body: (r.kind === "review" ? r["comment"] : r["body"]) as
            string | null,
          rating: r.kind === "review" ? (r["rating"] as number) : null,
          is_hidden: r["is_hidden"] as boolean,
          created_at: r["created_at"] as string,
        };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 80);
  });

const hideSchema = z.object({
  kind: z.enum(["review", "chat"]),
  id: z.string().min(1),
  hidden: z.boolean(),
});

/** Hide or restore a review / chat message. Uses the admin FOR ALL policies. */
export const setContentHidden = createServerFn({ method: "POST" })
  .validator((data: unknown) => hideSchema.parse(data))
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    const supabase = getSupabaseServerClient();
    const table = data.kind === "review" ? "reviews" : "chat_messages";
    const { data: rows, error } = await supabase
      .from(table)
      .update({ is_hidden: data.hidden })
      .eq("id", data.id)
      .select("id");
    if (error) {
      console.error("[admin] setContentHidden failed:", error.message);
      return { ok: false as const, error: "Could not update that item." };
    }
    if (!rows || rows.length === 0) {
      return { ok: false as const, error: "Item not found." };
    }
    await audit(
      supabase,
      admin.id,
      `${data.kind}.${data.hidden ? "hide" : "unhide"}`,
      data.kind,
      data.id,
    );
    return { ok: true as const };
  });

/* ── CSV export ─────────────────────────────────────────────────────────── */

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Pure: rows → RFC 4180 CSV. Tested in admin.test.ts. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  return (
    [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}

/** Every booking (newest first, up to 5000) as CSV for spreadsheets. */
export const exportBookingsCsv = createServerFn({ method: "GET" }).handler(
  async (): Promise<string> => {
    await requireAdmin();
    const supabase = getSupabaseServerClient();
    const { data: rows, error } = await supabase
      .from("bookings")
      .select(
        "id, confirmation_code, user_id, venue_slug, booking_date, booking_time, party_size, status, notes, created_at, venues(name), venue_locations(name)",
      )
      .order("booking_date", { ascending: false })
      .limit(5000);
    if (error) {
      console.error("[admin] exportBookingsCsv failed:", error.message);
      throw new Error("Could not export bookings");
    }
    const bookings = (rows ?? []) as Record<string, unknown>[];
    const userIds = [...new Set(bookings.map((b) => b["user_id"] as string))];
    const profiles = userIds.length
      ? await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", userIds)
      : { data: [] as Record<string, unknown>[] };
    const profileMap = new Map(
      ((profiles.data ?? []) as Record<string, unknown>[]).map((p) => [
        p["id"] as string,
        p,
      ]),
    );
    const headers = [
      "code",
      "date",
      "time",
      "venue",
      "branch",
      "party_size",
      "status",
      "member",
      "email",
      "notes",
      "created_at",
    ];
    const out = bookings.map((b) => {
      const p = profileMap.get(b["user_id"] as string);
      return [
        b["confirmation_code"],
        b["booking_date"],
        String(b["booking_time"] ?? "").slice(0, 5),
        (b["venues"] as { name: string } | null)?.name ?? b["venue_slug"],
        (b["venue_locations"] as { name: string } | null)?.name ?? "",
        b["party_size"],
        b["status"],
        p?.["display_name"] ?? "",
        p?.["email"] ?? "",
        b["notes"] ?? "",
        b["created_at"],
      ];
    });
    return toCsv(headers, out);
  },
);
