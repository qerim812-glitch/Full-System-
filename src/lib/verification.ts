import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getCurrentUser, getSupabaseServerClient } from "./supabase/server";
import {
  getSupabaseServiceRoleClient,
  serviceRoleConfigured,
} from "./supabase/service-role";

/**
 * Photo verification.
 *
 * A member uploads a photo of themselves; an admin compares it with their
 * profile picture and approves or rejects. No face matching and no third
 * party — the badge claims exactly "a human looked at this", which is the only
 * thing it can honestly claim.
 *
 * The photo goes to the private `verification` bucket (0019). Unlike avatars
 * it is not publicly readable: admins see it through a short-lived signed URL
 * minted server-side, so the image is never addressable by anyone who happens
 * to learn the path.
 */

export type VerificationStatus = "pending" | "approved" | "rejected";

export type MyVerification = {
  id: string;
  status: VerificationStatus;
  note: string | null;
  created_at: string;
};

export type VerificationRequest = MyVerification & {
  user_id: string;
  photo_path: string;
  display_name: string | null;
  avatar_url: string | null;
  /** Short-lived signed URL for the uploaded photo, or null if it expired. */
  photo_url: string | null;
};

export const fetchMyVerification = createServerFn({ method: "GET" }).handler(
  async (): Promise<MyVerification | null> => {
    const supabase = getSupabaseServerClient();
    // "verification: read own" scopes this to the caller.
    const { data, error } = await supabase
      .from("verification_requests")
      .select("id, status, note, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[verification] fetch own failed:", error.message);
      return null;
    }
    return (data as MyVerification | null) ?? null;
  },
);

const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const PHOTO_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Uploads the photo and opens the request.
 *
 * Goes through the server rather than uploading from the browser, matching
 * `uploadAvatar`. That matters more here than for avatars: the storage path is
 * built from the verified session user, so a caller cannot aim their request
 * at somebody else's photo, and the bucket policy's uid-folder rule is then a
 * second line rather than the only one.
 */
export const requestVerification = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Expected form data");
    const file = data.get("file");
    if (!(file instanceof File)) throw new Error("Choose a photo");
    return { file };
  })
  .handler(async ({ data }) => {
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "Please sign in again." };

    const { file } = data;
    const ext = PHOTO_TYPES[file.type];
    if (!ext) {
      return { ok: false as const, error: "Use a JPEG, PNG or WebP photo." };
    }
    if (file.size > PHOTO_MAX_BYTES) {
      return { ok: false as const, error: "Photo must be under 4 MB." };
    }

    const supabase = getSupabaseServerClient();
    // Path from the session, never from input.
    const photoPath = `${user.id}/verification.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("verification")
      .upload(photoPath, bytes, { upsert: true, contentType: file.type });

    if (uploadError) {
      console.error("[verification] upload failed:", uploadError.message);
      return {
        ok: false as const,
        error: /bucket not found/i.test(uploadError.message)
          ? "Verification storage is not set up yet. Run migration 0019."
          : "Could not upload that photo.",
      };
    }

    const { error } = await supabase
      .from("verification_requests")
      .insert({ user_id: user.id, photo_path: photoPath, status: "pending" });

    if (error) {
      if (/duplicate key|verification_one_pending/i.test(error.message)) {
        return {
          ok: false as const,
          error: "You already have a request waiting for review.",
        };
      }
      console.error("[verification] request failed:", error.message);
      return { ok: false as const, error: "Could not submit that request." };
    }
    return { ok: true as const };
  });

/** The admin review queue, with a signed URL for each photo. */
export const fetchVerificationQueue = createServerFn({ method: "GET" }).handler(
  async (): Promise<VerificationRequest[]> => {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("verification_requests")
      .select("id, user_id, photo_path, status, note, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) {
      console.error("[verification] queue failed:", error.message);
      return [];
    }
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) return [];

    const userIds = [...new Set(rows.map((r) => r["user_id"] as string))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", userIds);

    const profileById = new Map(
      ((profiles ?? []) as Array<Record<string, unknown>>).map((p) => [
        p["id"] as string,
        p,
      ]),
    );

    // The bucket is private, so a URL has to be signed. Ten minutes is long
    // enough to review a queue and short enough that a leaked link is useless.
    const signed = new Map<string, string>();
    if (serviceRoleConfigured()) {
      const service = getSupabaseServiceRoleClient();
      await Promise.all(
        rows.map(async (row) => {
          const path = row["photo_path"] as string;
          const { data: url } = await service.storage
            .from("verification")
            .createSignedUrl(path, 600);
          if (url?.signedUrl) signed.set(path, url.signedUrl);
        }),
      );
    }

    return rows.map((row) => {
      const profile = profileById.get(row["user_id"] as string);
      const path = row["photo_path"] as string;
      return {
        id: row["id"] as string,
        user_id: row["user_id"] as string,
        photo_path: path,
        status: row["status"] as VerificationStatus,
        note: (row["note"] as string | null) ?? null,
        created_at: row["created_at"] as string,
        display_name: (profile?.["display_name"] as string | null) ?? null,
        avatar_url: (profile?.["avatar_url"] as string | null) ?? null,
        photo_url: signed.get(path) ?? null,
      };
    });
  },
);

export const reviewVerification = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        approve: z.boolean(),
        note: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    // review_verification() checks is_admin() itself and flips the badge and
    // the request together, so the two can never disagree.
    const { data: result, error } = await supabase.rpc("review_verification", {
      p_request_id: data.requestId,
      p_approve: data.approve,
      p_note: data.note ?? null,
    });

    if (error) {
      console.error("[verification] review failed:", error.message);
      return { ok: false as const, error: "Could not record that decision." };
    }
    if (result === false) {
      return {
        ok: false as const,
        error: "That request is no longer pending.",
      };
    }
    return { ok: true as const };
  });
