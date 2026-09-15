import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getCurrentUser, getSupabaseServerClient } from "./supabase/server";

export type NotificationKind =
  | "connection_request"
  | "connection_accepted"
  | "booking_updated"
  | "connection_checkin"
  | "review_hidden"
  | "system";

export type Notification = {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export type UnreadCounts = { dmUnread: number; notificationsUnread: number };

/**
 * One cheap RPC for the header badge. Replaces polling 200 DM rows plus an
 * RPC plus a profile lookup every 30 s just to sum a count.
 */
export const fetchUnreadCounts = createServerFn({ method: "GET" }).handler(
  async (): Promise<UnreadCounts> => {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc("unread_counts").maybeSingle();
    if (error || !data) {
      if (error) console.error("[notifications] unread_counts:", error.message);
      return { dmUnread: 0, notificationsUnread: 0 };
    }
    const row = data as { dm_unread: number; notifications_unread: number };
    return {
      dmUnread: row.dm_unread ?? 0,
      notificationsUnread: row.notifications_unread ?? 0,
    };
  },
);

export const fetchNotifications = createServerFn({ method: "GET" }).handler(
  async (): Promise<Notification[]> => {
    const supabase = getSupabaseServerClient();
    // "notifications: read own" scopes this to the caller.
    const { data, error } = await supabase
      .from("notifications")
      .select("id, kind, title, body, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      console.error("[notifications] fetch failed:", error.message);
      return [];
    }
    return (data ?? []) as Notification[];
  },
);

export const markNotificationsRead = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({ ids: z.array(z.number().int()).max(200).optional() })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return { ok: false as const };
    let query = supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    if (data.ids && data.ids.length > 0) query = query.in("id", data.ids);
    const { error } = await query;
    if (error) {
      console.error("[notifications] markRead failed:", error.message);
      return { ok: false as const };
    }
    return { ok: true as const };
  });

export const clearNotifications = createServerFn({ method: "POST" }).handler(
  async () => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return { ok: false as const };
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("user_id", user.id);
    if (error) {
      console.error("[notifications] clear failed:", error.message);
      return { ok: false as const };
    }
    return { ok: true as const };
  },
);
