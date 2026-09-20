import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { displayNameFor, loadProfiles } from "./people";
import type { ChatMessage } from "./messaging";
import { getCurrentUser, getSupabaseServerClient } from "./supabase/server";

/** Group chat per meetup — see migration 0023. Same shape as venue chat. */

const roomSchema = z.object({ meetupId: z.string().uuid() });

export const meetupChatInputSchema = z.object({
  meetupId: z.string().uuid(),
  body: z.string().trim().min(1, "Type a message").max(1000),
});

export function mapMeetupChatError(message: string): string {
  if (/row-level security/i.test(message)) {
    return "Only people going to this meetup can post here.";
  }
  if (/char_length|body/i.test(message)) {
    return "That message is too long.";
  }
  return "Could not send that message. Please try again.";
}

export const fetchMeetupChat = createServerFn({ method: "GET" })
  .validator((data: unknown) => roomSchema.parse(data))
  .handler(async ({ data }): Promise<ChatMessage[]> => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return [];

    const { data: rows, error } = await supabase
      .from("meetup_messages")
      .select("id, body, created_at, user_id")
      .eq("meetup_id", data.meetupId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      console.error("[meetup-chat] fetch failed:", error.message);
      return [];
    }

    const messages = (rows ?? []).slice().reverse();
    const profiles = await loadProfiles(
      supabase,
      messages.map((m) => m.user_id as string),
    );
    return messages.map((m) => ({
      id: m.id as string,
      body: m.body as string,
      created_at: m.created_at as string,
      user_id: m.user_id as string,
      author_name: displayNameFor(profiles.get(m.user_id as string)),
      is_mine: m.user_id === user.id,
    }));
  });

export const postMeetupChat = createServerFn({ method: "POST" })
  .validator((data: unknown) => meetupChatInputSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "Please sign in again." };

    const { error } = await supabase.from("meetup_messages").insert({
      meetup_id: data.meetupId,
      user_id: user.id,
      body: data.body,
    });
    if (error) {
      console.error("[meetup-chat] post failed:", error.message);
      return { ok: false as const, error: mapMeetupChatError(error.message) };
    }
    return { ok: true as const };
  });
