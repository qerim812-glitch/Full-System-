import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { loadProfiles, type PublicProfile } from "./people";
import { getCurrentUser, getSupabaseServerClient } from "./supabase/server";

/**
 * Posts, stories, likes and comments — see migration 0022.
 *
 * Every read goes through RLS ("posts: read visible"), which already applies
 * hidden/blocked/suspended/expired rules, so nothing here filters twice. What
 * this module adds is the join work PostgREST cannot do for us: author
 * profiles, venue names, and "did I like this".
 */

export type PostKind = "post" | "story" | "checkin";

export type Post = {
  id: string;
  user_id: string;
  kind: PostKind;
  body: string | null;
  photo_url: string | null;
  venue_slug: string | null;
  venue_name: string | null;
  meetup_id: string | null;
  created_at: string;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  is_mine: boolean;
  author: PublicProfile;
};

export type PostComment = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  is_mine: boolean;
  author: PublicProfile;
};

export type StoryItem = {
  id: string;
  photo_url: string;
  body: string | null;
  venue_slug: string | null;
  venue_name: string | null;
  created_at: string;
};

/** One member's active stories, newest last, as a tappable ring. */
export type StoryGroup = {
  user_id: string;
  is_mine: boolean;
  author: PublicProfile;
  items: StoryItem[];
};

export const POST_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** How long a story stays up. */
export const STORY_TTL_HOURS = 24;

const PAGE = 20;

export const postBodySchema = z
  .string()
  .trim()
  .max(1000, "Keep it under 1000 characters");

const feedSchema = z.object({
  scope: z.enum(["all", "connections", "user", "venue"]).default("all"),
  userId: z.string().uuid().optional(),
  venueSlug: z.string().max(120).optional(),
  /** ISO timestamp; return posts strictly older than this. */
  before: z.string().datetime({ offset: true }).optional(),
});

export type FeedScope = z.infer<typeof feedSchema>["scope"];

export type PostPage = { posts: Post[]; nextBefore: string | null };

/** Turn a Postgres failure into copy a member can act on. */
export function mapPostError(message: string): string {
  if (/row-level security/i.test(message)) {
    return "You cannot post right now.";
  }
  if (/posts_has_content/i.test(message)) {
    return "Write something or add a photo.";
  }
  if (/char_length|body/i.test(message)) {
    return "That text is too long.";
  }
  return "Could not save that. Please try again.";
}

/** Accepted connections of the caller, both directions. */
async function connectionIdsOf(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  userId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("connections")
    .select("requester_id, addressee_id")
    .eq("status", "accepted");
  return ((data ?? []) as Array<Record<string, string>>)
    .map((row) =>
      row["requester_id"] === userId
        ? row["addressee_id"]
        : row["requester_id"],
    )
    .filter((id): id is string => Boolean(id) && id !== userId);
}

async function decorate(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  rows: Array<Record<string, unknown>>,
  userId: string,
): Promise<Post[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r["id"] as string);
  const slugs = [
    ...new Set(
      rows
        .map((r) => r["venue_slug"] as string | null)
        .filter((s): s is string => Boolean(s)),
    ),
  ];

  const [profiles, venues, likes] = await Promise.all([
    loadProfiles(
      supabase,
      rows.map((r) => r["user_id"] as string),
    ),
    slugs.length > 0
      ? supabase.from("venues").select("slug, name").in("slug", slugs)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    supabase
      .from("post_likes")
      .select("post_id")
      .eq("user_id", userId)
      .in("post_id", ids),
  ]);

  const venueName = new Map(
    ((venues.data ?? []) as Array<Record<string, unknown>>).map((v) => [
      v["slug"] as string,
      v["name"] as string,
    ]),
  );
  const liked = new Set(
    ((likes.data ?? []) as Array<Record<string, unknown>>).map(
      (l) => l["post_id"] as string,
    ),
  );

  return rows.map((r) => {
    const authorId = r["user_id"] as string;
    const slug = (r["venue_slug"] as string | null) ?? null;
    return {
      id: r["id"] as string,
      user_id: authorId,
      kind: r["kind"] as PostKind,
      body: (r["body"] as string | null) ?? null,
      photo_url: (r["photo_url"] as string | null) ?? null,
      venue_slug: slug,
      venue_name: slug ? (venueName.get(slug) ?? null) : null,
      meetup_id: (r["meetup_id"] as string | null) ?? null,
      created_at: r["created_at"] as string,
      like_count: Number(r["like_count"] ?? 0),
      comment_count: Number(r["comment_count"] ?? 0),
      liked_by_me: liked.has(r["id"] as string),
      is_mine: authorId === userId,
      author: profiles.get(authorId) ?? {
        id: authorId,
        display_name: null,
        avatar_url: null,
      },
    };
  });
}

const POST_COLUMNS =
  "id, user_id, kind, body, photo_url, venue_slug, meetup_id, created_at, like_count, comment_count";

/** A page of the feed, newest first. Stories are excluded — they have their own row. */
export const fetchPosts = createServerFn({ method: "GET" })
  .validator((data: unknown) => feedSchema.parse(data ?? {}))
  .handler(async ({ data }): Promise<PostPage> => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return { posts: [], nextBefore: null };

    let query = supabase
      .from("posts")
      .select(POST_COLUMNS)
      .neq("kind", "story")
      .order("created_at", { ascending: false })
      .limit(PAGE + 1);

    if (data.before) query = query.lt("created_at", data.before);

    if (data.scope === "user") {
      if (!data.userId) return { posts: [], nextBefore: null };
      query = query.eq("user_id", data.userId);
    } else if (data.scope === "venue") {
      if (!data.venueSlug) return { posts: [], nextBefore: null };
      query = query.eq("venue_slug", data.venueSlug);
    } else if (data.scope === "connections") {
      const ids = await connectionIdsOf(supabase, user.id);
      // Your own posts belong in your connections feed too.
      query = query.in("user_id", [...ids, user.id]);
    }

    const { data: rows, error } = await query;
    if (error) {
      console.error("[posts] fetchPosts failed:", error.message);
      return { posts: [], nextBefore: null };
    }

    const all = (rows ?? []) as Array<Record<string, unknown>>;
    const page = all.slice(0, PAGE);
    const posts = await decorate(supabase, page, user.id);
    const last = page[page.length - 1];
    return {
      posts,
      nextBefore:
        all.length > PAGE && last ? (last["created_at"] as string) : null,
    };
  });

export const fetchPost = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<Post | null> => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return null;
    const { data: row, error } = await supabase
      .from("posts")
      .select(POST_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) return null;
    const [post] = await decorate(
      supabase,
      [row as Record<string, unknown>],
      user.id,
    );
    return post ?? null;
  });

/** Active stories grouped by author; the caller's own group comes first. */
export const fetchStories = createServerFn({ method: "GET" }).handler(
  async (): Promise<StoryGroup[]> => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return [];

    const { data: rows, error } = await supabase
      .from("posts")
      .select(POST_COLUMNS)
      .eq("kind", "story")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) {
      console.error("[posts] fetchStories failed:", error.message);
      return [];
    }

    const items = await decorate(
      supabase,
      (rows ?? []) as Array<Record<string, unknown>>,
      user.id,
    );
    const groups = new Map<string, StoryGroup>();
    for (const item of items) {
      if (!item.photo_url) continue;
      const group = groups.get(item.user_id) ?? {
        user_id: item.user_id,
        is_mine: item.is_mine,
        author: item.author,
        items: [],
      };
      group.items.push({
        id: item.id,
        photo_url: item.photo_url,
        body: item.body,
        venue_slug: item.venue_slug,
        venue_name: item.venue_name,
        created_at: item.created_at,
      });
      groups.set(item.user_id, group);
    }
    return [...groups.values()].sort((a, b) => {
      if (a.is_mine !== b.is_mine) return a.is_mine ? -1 : 1;
      const la = a.items[a.items.length - 1]?.created_at ?? "";
      const lb = b.items[b.items.length - 1]?.created_at ?? "";
      return lb.localeCompare(la);
    });
  },
);

/**
 * Create a post or a story. Multipart, because a photo may come with it.
 *
 * Runs on the server for the same reason the avatar upload does: the browser
 * client cannot see the httpOnly session, so a client-side upload always
 * failed. MIME type is checked here and by the bucket; the extension comes
 * from the MIME type, never the client's filename.
 */
export const createPost = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Expected form data");
    const photo = data.get("photo");
    const kind = data.get("kind") === "story" ? "story" : "post";
    return {
      kind: kind as "post" | "story",
      body: postBodySchema.parse(String(data.get("body") ?? "")),
      venueSlug: z
        .string()
        .max(120)
        .optional()
        .parse(String(data.get("venueSlug") ?? "") || undefined),
      meetupId: z
        .string()
        .uuid()
        .optional()
        .parse(String(data.get("meetupId") ?? "") || undefined),
      photo: photo instanceof File && photo.size > 0 ? photo : null,
    };
  })
  .handler(async ({ data }) => {
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "Please sign in again." };
    if (!data.body && !data.photo) {
      return { ok: false as const, error: "Write something or add a photo." };
    }
    if (data.kind === "story" && !data.photo) {
      return { ok: false as const, error: "A story needs a photo." };
    }

    const supabase = getSupabaseServerClient();
    let photoUrl: string | null = null;

    if (data.photo) {
      const ext = PHOTO_TYPES[data.photo.type];
      if (!ext) {
        return { ok: false as const, error: "Use a JPEG, PNG or WebP image." };
      }
      if (data.photo.size > POST_PHOTO_MAX_BYTES) {
        return { ok: false as const, error: "Photos must be under 5 MB." };
      }
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const bytes = new Uint8Array(await data.photo.arrayBuffer());
      const { error: uploadError } = await supabase.storage
        .from("post-photos")
        .upload(path, bytes, {
          contentType: data.photo.type,
          cacheControl: "31536000",
        });
      if (uploadError) {
        console.error("[posts] photo upload failed:", uploadError.message);
        return {
          ok: false as const,
          error: /bucket not found/i.test(uploadError.message)
            ? "Photo storage is not set up yet (run migration 0022)."
            : "Upload failed. Please try again.",
        };
      }
      photoUrl = supabase.storage.from("post-photos").getPublicUrl(path)
        .data.publicUrl;
    }

    const { data: row, error } = await supabase
      .from("posts")
      .insert({
        user_id: user.id,
        kind: data.kind,
        body: data.body || null,
        photo_url: photoUrl,
        venue_slug: data.venueSlug ?? null,
        meetup_id: data.meetupId ?? null,
        expires_at:
          data.kind === "story"
            ? new Date(Date.now() + STORY_TTL_HOURS * 3_600_000).toISOString()
            : null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[posts] insert failed:", error.message);
      return { ok: false as const, error: mapPostError(error.message) };
    }
    return { ok: true as const, id: row.id as string };
  });

export const deletePost = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "Please sign in again." };

    // Fetch first so the photo can be removed from storage too; "posts:
    // delete own" makes someone else's id match no row.
    const { data: row } = await supabase
      .from("posts")
      .select("id, photo_url, user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row || row.user_id !== user.id) {
      return { ok: false as const, error: "Post not found." };
    }

    const { error } = await supabase.from("posts").delete().eq("id", data.id);
    if (error) {
      console.error("[posts] delete failed:", error.message);
      return { ok: false as const, error: "Could not delete that post." };
    }

    const photoUrl = row.photo_url as string | null;
    const marker = "/post-photos/";
    if (photoUrl && photoUrl.includes(marker)) {
      const path = photoUrl.slice(photoUrl.indexOf(marker) + marker.length);
      await supabase.storage.from("post-photos").remove([path]);
    }
    return { ok: true as const };
  });

export const setPostLiked = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ postId: z.string().uuid(), liked: z.boolean() }).parse(data),
  )
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "Please sign in again." };

    const { error } = data.liked
      ? await supabase
          .from("post_likes")
          .upsert(
            { post_id: data.postId, user_id: user.id },
            { onConflict: "post_id,user_id", ignoreDuplicates: true },
          )
      : await supabase
          .from("post_likes")
          .delete()
          .eq("post_id", data.postId)
          .eq("user_id", user.id);

    if (error) {
      console.error("[posts] like failed:", error.message);
      return { ok: false as const, error: "Could not update that like." };
    }
    return { ok: true as const };
  });

export const fetchComments = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ postId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }): Promise<PostComment[]> => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return [];

    const { data: rows, error } = await supabase
      .from("post_comments")
      .select("id, post_id, user_id, body, created_at")
      .eq("post_id", data.postId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) {
      console.error("[posts] fetchComments failed:", error.message);
      return [];
    }
    const list = (rows ?? []) as Array<Record<string, unknown>>;
    const profiles = await loadProfiles(
      supabase,
      list.map((r) => r["user_id"] as string),
    );
    return list.map((r) => {
      const authorId = r["user_id"] as string;
      return {
        id: r["id"] as string,
        post_id: r["post_id"] as string,
        user_id: authorId,
        body: r["body"] as string,
        created_at: r["created_at"] as string,
        is_mine: authorId === user.id,
        author: profiles.get(authorId) ?? {
          id: authorId,
          display_name: null,
          avatar_url: null,
        },
      };
    });
  });

export const addComment = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        postId: z.string().uuid(),
        body: z.string().trim().min(1, "Type a comment").max(500),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "Please sign in again." };

    const { error } = await supabase.from("post_comments").insert({
      post_id: data.postId,
      user_id: user.id,
      body: data.body,
    });
    if (error) {
      console.error("[posts] addComment failed:", error.message);
      return {
        ok: false as const,
        error: /row-level security/i.test(error.message)
          ? "You cannot comment on this post."
          : "Could not post that comment.",
      };
    }
    return { ok: true as const };
  });

export const deleteComment = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("post_comments")
      .delete()
      .eq("id", data.id);
    if (error) {
      console.error("[posts] deleteComment failed:", error.message);
      return { ok: false as const, error: "Could not delete that comment." };
    }
    return { ok: true as const };
  });
