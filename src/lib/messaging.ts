import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  displayNameFor,
  fetchBlockedIds,
  loadProfiles,
  type PublicProfile,
} from "./people";
import { getCurrentUser, getSupabaseServerClient } from "./supabase/server";

export type ChatMessage = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  author_name: string;
  is_mine: boolean;
};

export type DirectMessage = {
  id: string;
  body: string;
  created_at: string;
  sender_id: string;
  recipient_id: string;
  read_at: string | null;
  is_mine: boolean;
};

export type DmThread = {
  other: PublicProfile;
  other_name: string;
  last_body: string;
  last_at: string;
  unread: number;
};

/** Length ceilings mirror the CHECK constraints in 0006_messaging.sql. */
export const chatInputSchema = z.object({
  venueSlug: z.string().min(1).max(120),
  body: z.string().trim().min(1, "Type a message").max(1000),
});

export const dmInputSchema = z.object({
  recipientId: z.string().uuid(),
  body: z.string().trim().min(1, "Type a message").max(2000),
});

const venueOnlySchema = z.object({
  venueSlug: z.string().min(1).max(120),
});

const userOnlySchema = z.object({ userId: z.string().uuid() });

/**
 * Turns a Postgres failure into copy a user can act on.
 *
 * The chat insert policy requires a confirmed or completed booking at the
 * venue and a profile that is not suspended, so an RLS rejection almost
 * always means "you have not booked here".
 */
export function mapChatError(message: string): string {
  if (/row-level security/i.test(message)) {
    return "You can only post in a venue's chat after booking a table there.";
  }
  if (/char_length|body/i.test(message)) {
    return "That message is too long.";
  }
  return "Could not send that message. Please try again.";
}

/**
 * The DM insert policy fails for a block or for either party being
 * suspended. The two are deliberately reported the same way: telling someone
 * they have been blocked invites them to work around it.
 */
export function mapDmError(message: string): string {
  if (/row-level security/i.test(message)) {
    return "You cannot message this person.";
  }
  if (/dm_no_self/i.test(message)) {
    return "You cannot message yourself.";
  }
  if (/char_length|body/i.test(message)) {
    return "That message is too long.";
  }
  return "Could not send that message. Please try again.";
}

// ---------------------------------------------------------------------------
// Venue chat
// ---------------------------------------------------------------------------

/**
 * Recent messages for a venue's room, oldest last.
 *
 * "chat: read as member" already hides messages from anyone in a block
 * relationship, so no extra filtering is needed here.
 */
export const fetchVenueChat = createServerFn({ method: "GET" })
  .validator((data: unknown) => venueOnlySchema.parse(data))
  .handler(async ({ data }): Promise<ChatMessage[]> => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return [];

    const { data: rows, error } = await supabase
      .from("chat_messages")
      .select("id, body, created_at, user_id")
      .eq("venue_slug", data.venueSlug)
      .eq("is_hidden", false)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[chat] fetchVenueChat failed:", error.message);
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

export const postVenueChat = createServerFn({ method: "POST" })
  .validator((data: unknown) => chatInputSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "Please sign in again." };

    const { error } = await supabase.from("chat_messages").insert({
      venue_slug: data.venueSlug,
      user_id: user.id,
      body: data.body,
    });

    if (error) {
      console.error("[chat] postVenueChat failed:", error.message);
      return { ok: false as const, error: mapChatError(error.message) };
    }
    return { ok: true as const };
  });

export const deleteChatMessage = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    // "chat: delete own" makes someone else's id match no row.
    const { error } = await supabase
      .from("chat_messages")
      .delete()
      .eq("id", data.id);

    if (error) {
      console.error("[chat] delete failed:", error.message);
      return { ok: false as const, error: "Could not delete that message." };
    }
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Direct messages
// ---------------------------------------------------------------------------

/**
 * One row per conversation, newest first.
 *
 * Supabase has no DISTINCT ON, so the fold happens here: read the caller's
 * messages newest-first and keep the first sighting of each counterpart.
 * Capped at 200 rows, so a very busy account could miss an old quiet thread —
 * acceptable for an inbox view, and the alternative is a database view.
 */
export const fetchDmThreads = createServerFn({ method: "GET" }).handler(
  async (): Promise<DmThread[]> => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return [];

    // "dm: read own threads" scopes this to messages the caller sent or received.
    const { data: rows, error } = await supabase
      .from("direct_messages")
      .select("id, body, created_at, sender_id, recipient_id, read_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("[dm] fetchDmThreads failed:", error.message);
      return [];
    }

    const blocked = await fetchBlockedIds(supabase);
    const byOther = new Map<
      string,
      { last_body: string; last_at: string; unread: number }
    >();

    for (const row of rows ?? []) {
      const otherId =
        row.sender_id === user.id
          ? (row.recipient_id as string)
          : (row.sender_id as string);
      if (blocked.has(otherId)) continue;

      const existing = byOther.get(otherId);
      const isUnread = row.recipient_id === user.id && row.read_at === null;

      if (!existing) {
        byOther.set(otherId, {
          last_body: row.body as string,
          last_at: row.created_at as string,
          unread: isUnread ? 1 : 0,
        });
      } else if (isUnread) {
        existing.unread += 1;
      }
    }

    const profiles = await loadProfiles(supabase, [...byOther.keys()]);

    return [...byOther.entries()]
      .map(([id, thread]) => {
        const profile = profiles.get(id);
        return {
          other: profile ?? { id, display_name: null, avatar_url: null },
          other_name: displayNameFor(profile),
          ...thread,
        };
      })
      .sort((a, b) => b.last_at.localeCompare(a.last_at));
  },
);

/** Every message exchanged with one person, oldest last. */
export const fetchDmThread = createServerFn({ method: "GET" })
  .validator((data: unknown) => userOnlySchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return { messages: [], other: null, otherName: "Member" };

    const { data: rows, error } = await supabase
      .from("direct_messages")
      .select("id, body, created_at, sender_id, recipient_id, read_at")
      .or(`sender_id.eq.${data.userId},recipient_id.eq.${data.userId}`)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("[dm] fetchDmThread failed:", error.message);
      return { messages: [], other: null, otherName: "Member" };
    }

    const profiles = await loadProfiles(supabase, [data.userId]);
    const other = profiles.get(data.userId) ?? null;

    const messages: DirectMessage[] = (rows ?? [])
      .slice()
      .reverse()
      .map((m) => ({
        id: m.id as string,
        body: m.body as string,
        created_at: m.created_at as string,
        sender_id: m.sender_id as string,
        recipient_id: m.recipient_id as string,
        read_at: m.read_at as string | null,
        is_mine: m.sender_id === user.id,
      }));

    return { messages, other, otherName: displayNameFor(other ?? undefined) };
  });

export const sendDirectMessage = createServerFn({ method: "POST" })
  .validator((data: unknown) => dmInputSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "Please sign in again." };

    const { error } = await supabase.from("direct_messages").insert({
      sender_id: user.id,
      recipient_id: data.recipientId,
      body: data.body,
    });

    if (error) {
      console.error("[dm] send failed:", error.message);
      return { ok: false as const, error: mapDmError(error.message) };
    }
    return { ok: true as const };
  });

/** Mark everything this person sent me as read. */
export const markThreadRead = createServerFn({ method: "POST" })
  .validator((data: unknown) => userOnlySchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return { ok: false as const };

    // "dm: mark read as recipient" restricts this to rows addressed to us.
    const { error } = await supabase
      .from("direct_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("sender_id", data.userId)
      .eq("recipient_id", user.id)
      .is("read_at", null);

    if (error) {
      console.error("[dm] markThreadRead failed:", error.message);
      return { ok: false as const };
    }
    return { ok: true as const };
  });

/** Mark every unread DM in every thread as read in one sweep. */
export const markAllRead = createServerFn({ method: "POST" }).handler(
  async () => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return { ok: false as const };

    const { error } = await supabase
      .from("direct_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", user.id)
      .is("read_at", null);

    if (error) {
      console.error("[dm] markAllRead failed:", error.message);
      return { ok: false as const };
    }
    return { ok: true as const };
  },
);

// ---------------------------------------------------------------------------
// Blocking
// ---------------------------------------------------------------------------

export const fetchMyBlocks = createServerFn({ method: "GET" }).handler(
  async (): Promise<Array<PublicProfile & { name: string }>> => {
    const supabase = getSupabaseServerClient();

    // "blocks: manage own" scopes this to blocks the caller created — which
    // is exactly what a "people you blocked" list should show.
    const { data, error } = await supabase
      .from("blocks")
      .select("blocked_id")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[blocks] fetch failed:", error.message);
      return [];
    }

    const ids = (data ?? []).map((b) => b.blocked_id as string);
    const profiles = await loadProfiles(supabase, ids);

    return ids.map((id) => {
      const profile = profiles.get(id) ?? {
        id,
        display_name: null,
        avatar_url: null,
      };
      return { ...profile, name: displayNameFor(profiles.get(id)) };
    });
  },
);

export const blockUser = createServerFn({ method: "POST" })
  .validator((data: unknown) => userOnlySchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "Please sign in again." };

    if (data.userId === user.id) {
      return { ok: false as const, error: "You cannot block yourself." };
    }

    const { error } = await supabase
      .from("blocks")
      .insert({ blocker_id: user.id, blocked_id: data.userId });

    if (error) {
      // Already blocked is the end state the caller wanted.
      if (/duplicate key|blocks_pkey/i.test(error.message)) {
        return { ok: true as const };
      }
      console.error("[blocks] block failed:", error.message);
      return { ok: false as const, error: "Could not block that person." };
    }
    return { ok: true as const };
  });

export const unblockUser = createServerFn({ method: "POST" })
  .validator((data: unknown) => userOnlySchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("blocks")
      .delete()
      .eq("blocked_id", data.userId);

    if (error) {
      console.error("[blocks] unblock failed:", error.message);
      return { ok: false as const, error: "Could not unblock that person." };
    }
    return { ok: true as const };
  });
