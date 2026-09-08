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

export const fetchReportQueue = createServerFn({ method: "GET" }).handler(
  async () => {
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
    return data ?? [];
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
