import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  getSupabaseServiceRoleClient,
  serviceRoleConfigured,
} from "./supabase/service-role";
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
  target_kind: string | null;
  target_id: string | null;
  reportedUserLabel: string | null;
  venueName: string | null;
  /** The reported message / review itself, when the report names one. */
  targetBody: string | null;
  /** True when target_kind names a row that has since been deleted. */
  targetMissing: boolean;
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
        "id, reason, description, status, created_at, reported_user_id, venue_slug, target_kind, target_id",
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

    // The reported content itself, so a moderator can judge the report without
    // leaving the queue. Fetched per kind in two batched queries rather than
    // one per report. Direct messages are deliberately excluded: an admin
    // reading a private thread wholesale is a bigger privilege than reviewing
    // a report needs, so those show as "private message" with no body.
    const idsOfKind = (kind: string) =>
      reports
        .filter((r) => r["target_kind"] === kind && r["target_id"])
        .map((r) => r["target_id"] as string);

    const reviewIds = idsOfKind("review");
    const chatIds = idsOfKind("chat_message");
    const postIds = idsOfKind("post");
    const postCommentIds = idsOfKind("post_comment");

    const none = Promise.resolve({ data: [], error: null });
    const [reviewRows, chatRows, postRows, postCommentRows] = await Promise.all(
      [
        reviewIds.length > 0
          ? supabase.from("reviews").select("id, comment").in("id", reviewIds)
          : none,
        chatIds.length > 0
          ? supabase.from("chat_messages").select("id, body").in("id", chatIds)
          : none,
        postIds.length > 0
          ? supabase
              .from("posts")
              .select("id, body, photo_url")
              .in("id", postIds)
          : none,
        postCommentIds.length > 0
          ? supabase
              .from("post_comments")
              .select("id, body")
              .in("id", postCommentIds)
          : none,
      ],
    );

    const targetBodies = new Map<string, string | null>();
    for (const row of (reviewRows.data ?? []) as Record<string, unknown>[]) {
      targetBodies.set(row["id"] as string, (row["comment"] as string) ?? "");
    }
    for (const row of (chatRows.data ?? []) as Record<string, unknown>[]) {
      targetBodies.set(row["id"] as string, (row["body"] as string) ?? "");
    }
    for (const row of (postRows.data ?? []) as Record<string, unknown>[]) {
      const body = (row["body"] as string | null) ?? "";
      targetBodies.set(
        row["id"] as string,
        row["photo_url"] ? `${body} [photo: ${row["photo_url"]}]`.trim() : body,
      );
    }
    for (const row of (postCommentRows.data ?? []) as Record<
      string,
      unknown
    >[]) {
      targetBodies.set(row["id"] as string, (row["body"] as string) ?? "");
    }

    return reports.map((r) => {
      const profile = r.reported_user_id
        ? profileMap.get(r.reported_user_id)
        : undefined;
      const venue = r.venue_slug ? venueMap.get(r.venue_slug) : undefined;
      const targetId = r["target_id"] as string | null;
      const targetKind = r["target_kind"] as string | null;
      const hasBody =
        targetKind === "review" ||
        targetKind === "chat_message" ||
        targetKind === "post" ||
        targetKind === "post_comment";

      return {
        ...r,
        reportedUserLabel: r.reported_user_id
          ? (profile?.["display_name"] ??
            profile?.["email"] ??
            "Unknown member")
          : null,
        venueName: r.venue_slug ? (venue?.["name"] ?? r.venue_slug) : null,
        targetBody:
          hasBody && targetId ? (targetBodies.get(targetId) ?? null) : null,
        // A report whose content was already deleted or hidden still matters —
        // say so rather than rendering an empty quote that reads as "no text".
        targetMissing: Boolean(
          hasBody && targetId && !targetBodies.has(targetId),
        ),
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

/** Rows plus the unfiltered-by-page total, so the UI can page through. */
export type AdminPage<T> = { rows: T[]; total: number };

export const ADMIN_PAGE_SIZE = 50;

/**
 * Escapes a user-supplied search term for PostgREST's `or` filter.
 *
 * `,` separates the filters and `%` is the wildcard, so a term containing
 * either would otherwise change the shape of the query rather than being
 * searched for. Backslash-escaping is what PostgREST expects inside `ilike`.
 */
export function escapeSearchTerm(term: string): string {
  return term.replace(/[\\%_,().]/g, (c) => `\\${c}`);
}

export const fetchMembers = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z
      .object({
        page: z.number().int().min(0).default(0),
        search: z.string().trim().max(120).optional(),
        suspended: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<AdminPage<AdminMember>> => {
    await requireAdmin();
    const supabase = getSupabaseServerClient();

    let query = supabase
      .from("profiles")
      .select(
        "id, display_name, email, date_of_birth, is_suspended, created_at",
        { count: "exact" },
      );

    if (data.search) {
      const term = escapeSearchTerm(data.search);
      query = query.or(`display_name.ilike.%${term}%,email.ilike.%${term}%`);
    }
    if (data.suspended !== undefined) {
      query = query.eq("is_suspended", data.suspended);
    }

    const {
      data: rows,
      error,
      count,
    } = await query
      .order("created_at", { ascending: false })
      .range(
        data.page * ADMIN_PAGE_SIZE,
        (data.page + 1) * ADMIN_PAGE_SIZE - 1,
      );

    if (error) {
      console.error("[admin] fetchMembers failed:", error.message);
      return { rows: [], total: 0 };
    }
    return { rows: (rows ?? []) as AdminMember[], total: count ?? 0 };
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
  lat: number | null;
  lng: number | null;
  is_active: boolean;
};

const ADMIN_VENUE_COLUMNS =
  "slug, name, description, image_url, location_url, address, phone, category, price_band, opens_at, closes_at, slot_minutes, min_age, max_age, capacity, lat, lng, is_active";

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
      // numeric(9,6) comes back from PostgREST as a string.
      lat:
        r["lat"] === null || r["lat"] === undefined ? null : Number(r["lat"]),
      lng:
        r["lng"] === null || r["lng"] === undefined ? null : Number(r["lng"]),
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
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
  })
  // Mirrors venues_latlng_range in 0021: half a coordinate pair would put a
  // pin at an undefined longitude.
  .refine(
    (v) =>
      (v.lat === null || v.lat === undefined) ===
      (v.lng === null || v.lng === undefined),
    {
      message: "Enter both latitude and longitude, or neither",
      path: ["lng"],
    },
  )
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
      lat: data.lat ?? null,
      lng: data.lng ?? null,
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
  /** Both set or both null — venue_locations_latlng_range in 0021. */
  lat: number | null;
  lng: number | null;
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
      lat: r["lat"] === null ? null : Number(r["lat"]),
      lng: r["lng"] === null ? null : Number(r["lng"]),
      is_active: r["is_active"] as boolean,
    }));
  });

const locationUpsertSchema = z
  .object({
    id: z.string().uuid().optional(),
    venueSlug: z.string().min(1).max(120),
    name: z.string().trim().min(1).max(120),
    address: z.string().trim().max(300).nullable().optional(),
    capacity: z.number().int().min(1).max(10000).nullable().optional(),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
    is_active: z.boolean().default(true),
  })
  // Same both-or-neither rule as venue_locations_latlng_range in 0021.
  .refine(
    (v) =>
      (v.lat === null || v.lat === undefined) ===
      (v.lng === null || v.lng === undefined),
    {
      message: "Enter both latitude and longitude, or neither",
      path: ["lng"],
    },
  );

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
      lat: data.lat ?? null,
      lng: data.lng ?? null,
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

/* ── Content moderation (reviews, venue chat, posts, comments) ──────────── */

export type ModerationKind = "review" | "chat" | "post" | "post_comment";

export type ModerationItem = {
  kind: ModerationKind;
  id: string;
  venue_slug: string | null;
  venue_name: string | null;
  author_name: string | null;
  author_email: string | null;
  body: string | null;
  photo_url: string | null;
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
    let postsQ = supabase
      .from("posts")
      .select("id, venue_slug, user_id, body, photo_url, is_hidden, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.venueSlug) {
      reviewsQ = reviewsQ.eq("venue_slug", data.venueSlug);
      chatQ = chatQ.eq("venue_slug", data.venueSlug);
      postsQ = postsQ.eq("venue_slug", data.venueSlug);
    }
    const [reviews, chat, posts, comments, venues] = await Promise.all([
      reviewsQ,
      chatQ,
      postsQ,
      // Comments have no venue of their own, so a venue filter drops them.
      data.venueSlug
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .from("post_comments")
            .select("id, user_id, body, is_hidden, created_at")
            .order("created_at", { ascending: false })
            .limit(50),
      supabase.from("venues").select("slug, name"),
    ]);
    if (reviews.error)
      console.error("[admin] moderation reviews:", reviews.error.message);
    if (chat.error)
      console.error("[admin] moderation chat:", chat.error.message);
    if (posts.error)
      console.error("[admin] moderation posts:", posts.error.message);
    if (comments.error)
      console.error("[admin] moderation comments:", comments.error.message);

    const venueName = new Map(
      ((venues.data ?? []) as Array<{ slug: string; name: string }>).map(
        (v) => [v.slug, v.name],
      ),
    );
    const rows: Array<Record<string, unknown> & { kind: ModerationKind }> = [
      ...((reviews.data ?? []) as Record<string, unknown>[]).map((r) => ({
        ...r,
        kind: "review" as const,
      })),
      ...((chat.data ?? []) as Record<string, unknown>[]).map((r) => ({
        ...r,
        kind: "chat" as const,
      })),
      ...((posts.data ?? []) as Record<string, unknown>[]).map((r) => ({
        ...r,
        kind: "post" as const,
      })),
      ...((comments.data ?? []) as Record<string, unknown>[]).map((r) => ({
        ...r,
        kind: "post_comment" as const,
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
          venue_slug: (r["venue_slug"] as string | null) ?? null,
          venue_name: r["venue_slug"]
            ? (venueName.get(r["venue_slug"] as string) ?? null)
            : null,
          author_name: (p?.["display_name"] as string | null) ?? null,
          author_email: (p?.["email"] as string | null) ?? null,
          body: (r.kind === "review" ? r["comment"] : r["body"]) as
            string | null,
          photo_url: (r["photo_url"] as string | null) ?? null,
          rating: r.kind === "review" ? (r["rating"] as number) : null,
          is_hidden: r["is_hidden"] as boolean,
          created_at: r["created_at"] as string,
        };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 80);
  });

const hideSchema = z.object({
  kind: z.enum(["review", "chat", "post", "post_comment"]),
  id: z.string().min(1),
  hidden: z.boolean(),
});

const HIDE_TABLES = {
  review: "reviews",
  chat: "chat_messages",
  post: "posts",
  post_comment: "post_comments",
} as const;

/** Hide or restore a review / chat message / post / comment. Uses the admin FOR ALL policies. */
export const setContentHidden = createServerFn({ method: "POST" })
  .validator((data: unknown) => hideSchema.parse(data))
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    const supabase = getSupabaseServerClient();
    const table = HIDE_TABLES[data.kind];
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

/* ── Analytics ──────────────────────────────────────────────────────────── */

export type BookingsDay = { day: string; bookings: number; cancelled: number };
export type VenueBookings = {
  venue_slug: string;
  venue_name: string;
  bookings: number;
  seats: number;
};
export type MembersWeek = { week_start: string; joined: number };
export type DonationTotal = {
  currency: string;
  confirmed_minor: number;
  pending_minor: number;
  confirmed_count: number;
  pending_count: number;
};

export type AdminAnalytics = {
  bookingsDaily: BookingsDay[];
  bookingsByVenue: VenueBookings[];
  membersWeekly: MembersWeek[];
  donationTotals: DonationTotal[];
};

/**
 * The four aggregate series behind the Dashboard tab.
 *
 * These are RPCs rather than PostgREST queries because each one groups across
 * every member's rows — `select … group by` is not expressible through
 * PostgREST, and pulling every booking into JS to count it would get slower
 * with every booking taken. The functions are `security definer` and check
 * `is_admin()` themselves (0016), so the aggregation happens next to the data
 * without handing a non-admin a way to read it.
 */
export const fetchAdminAnalytics = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z
      .object({
        days: z.number().int().min(7).max(365).default(30),
        weeks: z.number().int().min(4).max(104).default(12),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<AdminAnalytics> => {
    await requireAdmin();
    const supabase = getSupabaseServerClient();

    const [daily, byVenue, weekly, donations] = await Promise.all([
      supabase.rpc("admin_bookings_daily", { days: data.days }),
      supabase.rpc("admin_bookings_by_venue"),
      supabase.rpc("admin_members_weekly", { weeks: data.weeks }),
      supabase.rpc("admin_donation_totals"),
    ]);

    // A failed aggregate returns null, which would render as an empty chart
    // indistinguishable from "no bookings yet". Log each one.
    for (const [label, result] of [
      ["bookings_daily", daily],
      ["bookings_by_venue", byVenue],
      ["members_weekly", weekly],
      ["donation_totals", donations],
    ] as const) {
      if (result.error) {
        console.error(`[admin] analytics ${label}:`, result.error.message);
      }
    }

    return {
      bookingsDaily: (daily.data ?? []) as BookingsDay[],
      bookingsByVenue: (byVenue.data ?? []) as VenueBookings[],
      membersWeekly: (weekly.data ?? []) as MembersWeek[],
      donationTotals: (donations.data ?? []) as DonationTotal[],
    };
  });

/* ── Member drill-down ──────────────────────────────────────────────────── */

export type MemberStats = {
  bookings_total: number;
  bookings_confirmed: number;
  bookings_cancelled: number;
  reviews_total: number;
  reports_filed: number;
  reports_received: number;
  connections_total: number;
  donations_confirmed_count: number;
};

export type MemberDetail = {
  profile: AdminMember & { avatar_url: string | null };
  stats: MemberStats | null;
  isAdmin: boolean;
  recentBookings: Array<{
    id: string;
    venue_slug: string;
    venue_name: string | null;
    booking_date: string;
    booking_time: string;
    party_size: number;
    status: string;
  }>;
  recentReviews: Array<{
    id: string;
    venue_slug: string;
    rating: number;
    comment: string | null;
    is_hidden: boolean;
    created_at: string;
  }>;
};

/**
 * Everything about one member on one screen.
 *
 * `isAdmin` comes from the auth user's app_metadata, which lives in
 * `auth.users` and is not reachable through PostgREST — hence the service-role
 * admin API. When the service-role key is absent the field falls back to false
 * and the UI hides the role controls rather than showing a wrong badge.
 */
export const fetchMemberDetail = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }): Promise<MemberDetail | null> => {
    await requireAdmin();
    const supabase = getSupabaseServerClient();

    const [profileResult, statsResult, bookingsResult, reviewsResult] =
      await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id, display_name, email, date_of_birth, is_suspended, avatar_url, created_at",
          )
          .eq("id", data.userId)
          .maybeSingle(),
        supabase.rpc("admin_member_stats", { member_id: data.userId }),
        supabase
          .from("bookings")
          .select(
            "id, venue_slug, booking_date, booking_time, party_size, status, venues(name)",
          )
          .eq("user_id", data.userId)
          .order("booking_date", { ascending: false })
          .limit(10),
        supabase
          .from("reviews")
          .select("id, venue_slug, rating, comment, is_hidden, created_at")
          .eq("user_id", data.userId)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

    if (profileResult.error || !profileResult.data) {
      if (profileResult.error) {
        console.error(
          "[admin] fetchMemberDetail profile:",
          profileResult.error.message,
        );
      }
      return null;
    }

    // admin_member_stats returns a single row; PostgREST hands back an array.
    const statsRows = (statsResult.data ?? []) as MemberStats[];
    if (statsResult.error) {
      console.error("[admin] member stats:", statsResult.error.message);
    }

    let isAdmin = false;
    if (serviceRoleConfigured()) {
      try {
        const { data: authUser } =
          await getSupabaseServiceRoleClient().auth.admin.getUserById(
            data.userId,
          );
        isAdmin = authUser?.user?.app_metadata?.["role"] === "admin";
      } catch (error) {
        console.error("[admin] could not read role:", error);
      }
    }

    return {
      profile: profileResult.data as MemberDetail["profile"],
      stats: statsRows[0] ?? null,
      isAdmin,
      recentBookings: (
        (bookingsResult.data ?? []) as Record<string, unknown>[]
      ).map((b) => ({
        id: b["id"] as string,
        venue_slug: b["venue_slug"] as string,
        venue_name: (b["venues"] as { name: string } | null)?.name ?? null,
        booking_date: b["booking_date"] as string,
        booking_time: String(b["booking_time"] ?? "").slice(0, 5),
        party_size: b["party_size"] as number,
        status: b["status"] as string,
      })),
      recentReviews: (reviewsResult.data ??
        []) as MemberDetail["recentReviews"],
    };
  });

/**
 * Grant or revoke admin.
 *
 * The role lives in `app_metadata`, never `user_metadata`: a user can write
 * their own user_metadata through the client SDK, so a role stored there would
 * be self-grantable and would hand any account the whole database. app_metadata
 * is writable only with the service-role key, which is why this needs it.
 *
 * The change lands in the JWT when it is next issued, so the target must sign
 * out and back in — the return value says so, and the UI repeats it.
 */
export const setMemberAdmin = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ userId: z.string().uuid(), admin: z.boolean() }).parse(data),
  )
  .handler(async ({ data }) => {
    const actor = await requireAdmin();

    if (data.userId === actor.id) {
      // Without this an admin can lock the whole team out of the dashboard in
      // one click, with no way back that does not involve the CLI.
      return {
        ok: false as const,
        error: "You cannot change your own admin role.",
      };
    }
    if (!serviceRoleConfigured()) {
      return {
        ok: false as const,
        error:
          "SUPABASE_SERVICE_ROLE_KEY is not configured on the server, so roles cannot be changed from here. Use scripts/promote-admin.mjs.",
      };
    }

    const service = getSupabaseServiceRoleClient();
    const { data: existing, error: readError } =
      await service.auth.admin.getUserById(data.userId);
    if (readError || !existing?.user) {
      return { ok: false as const, error: "That member no longer exists." };
    }

    // Spread the existing metadata: app_metadata is replaced wholesale, so
    // assigning only { role } would silently drop the provider claims Supabase
    // keeps there.
    const appMetadata = { ...(existing.user.app_metadata ?? {}) };
    if (data.admin) appMetadata["role"] = "admin";
    else delete appMetadata["role"];

    const { error } = await service.auth.admin.updateUserById(data.userId, {
      app_metadata: appMetadata,
    });
    if (error) {
      console.error("[admin] setMemberAdmin failed:", error.message);
      return { ok: false as const, error: "Could not change that role." };
    }

    await audit(
      getSupabaseServerClient(),
      actor.id,
      data.admin ? "user.promote_admin" : "user.demote_admin",
      "profile",
      data.userId,
    );

    return {
      ok: true as const,
      note: "They must sign out and back in for it to take effect.",
    };
  });

/**
 * Erase a member and everything of theirs (GDPR article 17).
 *
 * Deleting the auth user cascades: profiles, bookings, reviews, chat messages,
 * direct messages, connections and check-ins all reference `auth.users` with
 * ON DELETE CASCADE. Donations use ON DELETE SET NULL on purpose — the
 * financial record has to survive, and it keeps only an amount once the
 * member is gone.
 *
 * Irreversible, so it takes the member's exact email as confirmation rather
 * than trusting a single click.
 */
export const deleteMember = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        confirmEmail: z.string().trim().min(1).max(320),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const actor = await requireAdmin();

    if (data.userId === actor.id) {
      return {
        ok: false as const,
        error: "Delete your own account from the Account page, not here.",
      };
    }
    if (!serviceRoleConfigured()) {
      return {
        ok: false as const,
        error:
          "SUPABASE_SERVICE_ROLE_KEY is not configured on the server, so accounts cannot be deleted from here.",
      };
    }

    const supabase = getSupabaseServerClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, display_name")
      .eq("id", data.userId)
      .maybeSingle();

    const email = (profile as { email: string | null } | null)?.email ?? null;
    if (!email || email.toLowerCase() !== data.confirmEmail.toLowerCase()) {
      return {
        ok: false as const,
        error: "That email does not match this member. Nothing was deleted.",
      };
    }

    // Audited BEFORE the delete: audit_log.actor_id references auth.users, and
    // writing the entry afterwards would race the cascade that removes the row
    // the entry points at.
    await audit(supabase, actor.id, "user.delete", "profile", data.userId, {
      email,
    });

    const { error } =
      await getSupabaseServiceRoleClient().auth.admin.deleteUser(data.userId);
    if (error) {
      console.error("[admin] deleteMember failed:", error.message);
      return { ok: false as const, error: "Could not delete that account." };
    }
    return { ok: true as const };
  });

/* ── Reviews ────────────────────────────────────────────────────────────── */

export type AdminReview = {
  id: string;
  venue_slug: string;
  venue_name: string | null;
  user_id: string;
  author_name: string | null;
  author_email: string | null;
  rating: number;
  comment: string | null;
  is_hidden: boolean;
  created_at: string;
};

/**
 * Every review, filterable — the moderation feed only ever showed the latest
 * 50 mixed with chat, which is no use for "show me the one-star reviews of
 * this venue".
 */
export const fetchAdminReviews = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z
      .object({
        page: z.number().int().min(0).default(0),
        venueSlug: z.string().max(120).optional(),
        rating: z.number().int().min(1).max(5).optional(),
        hidden: z.boolean().optional(),
        search: z.string().trim().max(200).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<AdminPage<AdminReview>> => {
    await requireAdmin();
    const supabase = getSupabaseServerClient();

    let query = supabase
      .from("reviews")
      .select(
        "id, venue_slug, user_id, rating, comment, is_hidden, created_at",
        { count: "exact" },
      );

    if (data.venueSlug) query = query.eq("venue_slug", data.venueSlug);
    if (data.rating !== undefined) query = query.eq("rating", data.rating);
    if (data.hidden !== undefined) query = query.eq("is_hidden", data.hidden);
    if (data.search) {
      query = query.ilike("comment", `%${escapeSearchTerm(data.search)}%`);
    }

    const {
      data: rows,
      error,
      count,
    } = await query
      .order("created_at", { ascending: false })
      .range(
        data.page * ADMIN_PAGE_SIZE,
        (data.page + 1) * ADMIN_PAGE_SIZE - 1,
      );

    if (error) {
      console.error("[admin] fetchAdminReviews failed:", error.message);
      return { rows: [], total: 0 };
    }

    const reviews = (rows ?? []) as Record<string, unknown>[];
    const userIds = [...new Set(reviews.map((r) => r["user_id"] as string))];
    const slugs = [...new Set(reviews.map((r) => r["venue_slug"] as string))];

    const [profiles, venues] = await Promise.all([
      userIds.length > 0
        ? supabase
            .from("profiles")
            .select("id, display_name, email")
            .in("id", userIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      slugs.length > 0
        ? supabase.from("venues").select("slug, name").in("slug", slugs)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ]);

    const profileMap = new Map(
      ((profiles.data ?? []) as Record<string, unknown>[]).map((p) => [
        p["id"] as string,
        p,
      ]),
    );
    const venueMap = new Map(
      ((venues.data ?? []) as Record<string, unknown>[]).map((v) => [
        v["slug"] as string,
        v["name"] as string,
      ]),
    );

    return {
      total: count ?? 0,
      rows: reviews.map((r) => {
        const profile = profileMap.get(r["user_id"] as string);
        return {
          id: r["id"] as string,
          venue_slug: r["venue_slug"] as string,
          venue_name: venueMap.get(r["venue_slug"] as string) ?? null,
          user_id: r["user_id"] as string,
          author_name: (profile?.["display_name"] as string | null) ?? null,
          author_email: (profile?.["email"] as string | null) ?? null,
          rating: r["rating"] as number,
          comment: (r["comment"] as string | null) ?? null,
          is_hidden: r["is_hidden"] as boolean,
          created_at: r["created_at"] as string,
        };
      }),
    };
  });

/* ── More CSV exports ───────────────────────────────────────────────────── */

const EXPORT_LIMIT = 5000;

/** Every member as CSV. Emails are personal data — handle the file carefully. */
export const exportMembersCsv = createServerFn({ method: "GET" }).handler(
  async (): Promise<string> => {
    await requireAdmin();
    const supabase = getSupabaseServerClient();
    const { data: rows, error } = await supabase
      .from("profiles")
      .select(
        "id, display_name, email, date_of_birth, is_suspended, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(EXPORT_LIMIT);
    if (error) {
      console.error("[admin] exportMembersCsv failed:", error.message);
      throw new Error("Could not export members");
    }
    return toCsv(
      ["id", "name", "email", "date_of_birth", "suspended", "joined"],
      ((rows ?? []) as Record<string, unknown>[]).map((r) => [
        r["id"],
        r["display_name"] ?? "",
        r["email"] ?? "",
        r["date_of_birth"],
        r["is_suspended"] ? "yes" : "no",
        r["created_at"],
      ]),
    );
  },
);

/**
 * Every donation as CSV.
 *
 * `amount_minor` is exported as a decimal string built by slicing, not by
 * dividing — `1250 / 100` is fine but `amount / 100` on larger values in a
 * spreadsheet is where rounding creeps into money.
 */
export const exportDonationsCsv = createServerFn({ method: "GET" }).handler(
  async (): Promise<string> => {
    await requireAdmin();
    const supabase = getSupabaseServerClient();
    const { data: rows, error } = await supabase
      .from("donations")
      .select(
        "id, amount_minor, currency, method, provider, status, donor_email, donor_name, provider_ref, message, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(EXPORT_LIMIT);
    if (error) {
      console.error("[admin] exportDonationsCsv failed:", error.message);
      throw new Error("Could not export donations");
    }
    return toCsv(
      [
        "id",
        "amount",
        "currency",
        "method",
        "provider",
        "status",
        "donor_email",
        "donor_name",
        "provider_ref",
        "message",
        "created_at",
      ],
      ((rows ?? []) as Record<string, unknown>[]).map((r) => {
        const minor = String(r["amount_minor"] ?? "0").padStart(3, "0");
        return [
          r["id"],
          `${minor.slice(0, -2)}.${minor.slice(-2)}`,
          r["currency"],
          r["method"],
          r["provider"],
          r["status"],
          r["donor_email"] ?? "",
          r["donor_name"] ?? "",
          r["provider_ref"] ?? "",
          r["message"] ?? "",
          r["created_at"],
        ];
      }),
    );
  },
);

/** Every report as CSV, resolved ones included. */
export const exportReportsCsv = createServerFn({ method: "GET" }).handler(
  async (): Promise<string> => {
    await requireAdmin();
    const supabase = getSupabaseServerClient();
    const { data: rows, error } = await supabase
      .from("reports")
      .select(
        "id, reason, description, status, target_kind, target_id, reported_user_id, venue_slug, resolution_note, resolved_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(EXPORT_LIMIT);
    if (error) {
      console.error("[admin] exportReportsCsv failed:", error.message);
      throw new Error("Could not export reports");
    }
    return toCsv(
      [
        "id",
        "reason",
        "status",
        "target_kind",
        "target_id",
        "reported_user_id",
        "venue_slug",
        "description",
        "resolution_note",
        "resolved_at",
        "created_at",
      ],
      ((rows ?? []) as Record<string, unknown>[]).map((r) => [
        r["id"],
        r["reason"],
        r["status"],
        r["target_kind"] ?? "",
        r["target_id"] ?? "",
        r["reported_user_id"] ?? "",
        r["venue_slug"] ?? "",
        r["description"] ?? "",
        r["resolution_note"] ?? "",
        r["resolved_at"] ?? "",
        r["created_at"],
      ]),
    );
  },
);

/** Every review as CSV, hidden ones included and flagged. */
export const exportReviewsCsv = createServerFn({ method: "GET" }).handler(
  async (): Promise<string> => {
    await requireAdmin();
    const supabase = getSupabaseServerClient();
    const { data: rows, error } = await supabase
      .from("reviews")
      .select("id, venue_slug, user_id, rating, comment, is_hidden, created_at")
      .order("created_at", { ascending: false })
      .limit(EXPORT_LIMIT);
    if (error) {
      console.error("[admin] exportReviewsCsv failed:", error.message);
      throw new Error("Could not export reviews");
    }
    const reviews = (rows ?? []) as Record<string, unknown>[];
    const userIds = [...new Set(reviews.map((r) => r["user_id"] as string))];
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
    return toCsv(
      [
        "id",
        "venue",
        "member",
        "email",
        "rating",
        "hidden",
        "comment",
        "created_at",
      ],
      reviews.map((r) => {
        const p = profileMap.get(r["user_id"] as string);
        return [
          r["id"],
          r["venue_slug"],
          p?.["display_name"] ?? "",
          p?.["email"] ?? "",
          r["rating"],
          r["is_hidden"] ? "yes" : "no",
          r["comment"] ?? "",
          r["created_at"],
        ];
      }),
    );
  },
);
