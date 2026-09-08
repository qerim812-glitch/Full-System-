import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getCurrentUser, getSupabaseServerClient } from "./supabase/server";

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  date_of_birth: string;
  is_suspended: boolean;
  created_at: string;
};

export const fetchMyProfile = createServerFn({ method: "GET" }).handler(
  async (): Promise<Profile | null> => {
    const supabase = getSupabaseServerClient();
    // RLS "profiles: read own" scopes this to the caller.
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, email, display_name, date_of_birth, is_suspended, created_at",
      )
      .maybeSingle();

    if (error) {
      console.error("[profile] fetch failed:", error.message);
      return null;
    }
    return data as Profile | null;
  },
);

const updateSchema = z.object({
  displayName: z.string().trim().min(2, "Enter your name").max(60),
});

export const updateProfile = createServerFn({ method: "POST" })
  .validator((data: unknown) => updateSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "You are not signed in." };

    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: data.displayName })
      .eq("id", user.id);

    if (error) {
      console.error("[profile] update failed:", error.message);
      return { ok: false as const, error: "Could not save your changes." };
    }
    return { ok: true as const };
  });

/**
 * GDPR Article 15 — a data subject may obtain a copy of their personal data.
 *
 * Every query below is scoped by RLS to the caller, so this returns exactly
 * the caller's own rows and nobody else's.
 */
export const exportMyData = createServerFn({ method: "POST" }).handler(
  async () => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return null;

    const [
      profile,
      bookings,
      reviews,
      favorites,
      reports,
      donations,
      chatMessages,
      directMessages,
      blocks,
    ] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("bookings").select("*"),
      supabase.from("reviews").select("*"),
      supabase.from("favorites").select("*"),
      supabase.from("reports").select("*"),
      supabase.from("donations").select("*"),
      // Messages the caller wrote. "chat: read as member" would also return
      // other people's messages, so this is narrowed to the caller's own —
      // an export is the caller's data, not the rooms they were in.
      supabase.from("chat_messages").select("*").eq("user_id", user.id),
      // Both sides of a DM are the caller's own correspondence, and
      // "dm: read own threads" already scopes this to their threads.
      supabase.from("direct_messages").select("*"),
      supabase.from("blocks").select("*"),
    ]);

    return {
      exported_at: new Date().toISOString(),
      profile: profile.data ?? [],
      bookings: bookings.data ?? [],
      reviews: reviews.data ?? [],
      favorites: favorites.data ?? [],
      reports: reports.data ?? [],
      donations: donations.data ?? [],
      chat_messages: chatMessages.data ?? [],
      direct_messages: directMessages.data ?? [],
      blocks: blocks.data ?? [],
    };
  },
);
