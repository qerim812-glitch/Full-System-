import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { SUPABASE_URL } from "./env";
import { getCurrentUser, getSupabaseServerClient } from "./supabase/server";

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  date_of_birth: string;
  avatar_url: string | null;
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
        "id, email, display_name, date_of_birth, avatar_url, is_suspended, created_at",
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

/* ── Avatar upload ──────────────────────────────────────────────────────── */

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Upload runs on the server because the browser Supabase client cannot see
 * the httpOnly session cookie (so a client-side upload always failed with
 * "not signed in"). The file arrives as multipart FormData. MIME type is
 * checked here and again by the bucket's allowed_mime_types; the extension
 * is derived from the MIME type, never from the client filename.
 */
export const uploadAvatar = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Expected form data");
    const file = data.get("file");
    if (!(file instanceof File)) throw new Error("Choose an image");
    return { file };
  })
  .handler(async ({ data }) => {
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "You are not signed in." };

    const { file } = data;
    const ext = AVATAR_TYPES[file.type];
    if (!ext) {
      return { ok: false as const, error: "Use a JPEG, PNG or WebP image." };
    }
    if (file.size > AVATAR_MAX_BYTES) {
      return { ok: false as const, error: "Image must be under 2 MB." };
    }

    const supabase = getSupabaseServerClient();
    const path = `${user.id}/avatar.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, bytes, {
        upsert: true,
        contentType: file.type,
        cacheControl: "3600",
      });
    if (uploadError) {
      console.error("[profile] avatar upload failed:", uploadError.message);
      return {
        ok: false as const,
        error: /bucket not found/i.test(uploadError.message)
          ? "Avatar storage is not set up yet (run migration 0014)."
          : "Upload failed. Please try again.",
      };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(path);
    // Version the URL so caches (and other members' pages) pick up the new
    // image; the object path itself stays stable.
    const avatarUrl = `${publicUrl}?v=${Date.now()}`;

    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: avatarUrl })
      .eq("id", user.id);
    if (error) {
      console.error("[profile] avatar save failed:", error.message);
      return { ok: false as const, error: "Could not save your avatar." };
    }
    return { ok: true as const, avatarUrl };
  });

export const removeAvatar = createServerFn({ method: "POST" }).handler(
  async () => {
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "You are not signed in." };
    const supabase = getSupabaseServerClient();
    await supabase.storage
      .from("avatars")
      .remove(Object.values(AVATAR_TYPES).map((e) => `${user.id}/avatar.${e}`));
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", user.id);
    if (error) {
      return { ok: false as const, error: "Could not remove your avatar." };
    }
    return { ok: true as const };
  },
);

/** True when a URL points at this project's avatar bucket. */
export function isOwnStorageUrl(url: string): boolean {
  return url.startsWith(`${SUPABASE_URL}/storage/v1/object/public/avatars/`);
}

/* ── GDPR ───────────────────────────────────────────────────────────────── */

/**
 * Article 15 — a copy of the caller's personal data. Every query is scoped
 * by RLS to the caller. Errors are surfaced rather than swallowed so an
 * export can never silently omit a table.
 */
export const exportMyData = createServerFn({ method: "POST" }).handler(
  async (): Promise<string | null> => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return null;

    const tables = [
      ["profile", supabase.from("profiles").select("*")],
      ["bookings", supabase.from("bookings").select("*")],
      ["reviews", supabase.from("reviews").select("*").eq("user_id", user.id)],
      ["favorites", supabase.from("favorites").select("*")],
      ["reports", supabase.from("reports").select("*")],
      ["donations", supabase.from("donations").select("*")],
      // Own messages only: "chat: read as member" would also return other
      // people's messages, and an export is the caller's data.
      [
        "chat_messages",
        supabase.from("chat_messages").select("*").eq("user_id", user.id),
      ],
      ["direct_messages", supabase.from("direct_messages").select("*")],
      ["blocks", supabase.from("blocks").select("*")],
      ["connections", supabase.from("connections").select("*")],
      [
        "presence_checkins",
        supabase.from("presence_checkins").select("*").eq("user_id", user.id),
      ],
      ["notifications", supabase.from("notifications").select("*")],
    ] as const;

    const results = await Promise.all(tables.map(([, q]) => q));
    const out: Record<string, unknown> = {
      exported_at: new Date().toISOString(),
      user_id: user.id,
      email: user.email ?? null,
    };
    const errors: string[] = [];
    results.forEach((res, i) => {
      const name = tables[i]?.[0] ?? `table_${i}`;
      if (res.error) {
        errors.push(`${name}: ${res.error.message}`);
        out[name] = null;
      } else {
        out[name] = res.data ?? [];
      }
    });
    if (errors.length > 0) {
      console.error("[profile] export partial:", errors.join("; "));
      out["incomplete_tables"] = errors.map((e) => e.split(":")[0]);
    }
    // Serialised here: the payload is an open-ended object, which the
    // server-function serialiser cannot type; the UI downloads it as a file.
    return JSON.stringify(out, null, 2);
  },
);

/**
 * Article 17 — erasure. delete_my_account() removes the auth.users row and
 * every FK cascades. The session cookie is cleared afterwards.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ confirm: z.literal("DELETE") }).parse(data),
  )
  .handler(async () => {
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "You are not signed in." };
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.rpc("delete_my_account");
    if (error) {
      console.error("[profile] delete account failed:", error.message);
      return {
        ok: false as const,
        error: "Could not delete the account. Contact support.",
      };
    }
    await supabase.auth.signOut();
    return { ok: true as const };
  });
