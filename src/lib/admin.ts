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
      supabase.from("venues").select("id", { count: "exact", head: true }),
    ]);

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
