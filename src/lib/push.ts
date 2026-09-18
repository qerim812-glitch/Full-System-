import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getCurrentUser, getSupabaseServerClient } from "./supabase/server";

/**
 * Web Push subscriptions.
 *
 * Turned off unless three environment variables are set:
 *
 *   VITE_VAPID_PUBLIC_KEY   public — the browser needs it to subscribe
 *   VAPID_PRIVATE_KEY       server only — signs the push
 *   VAPID_SUBJECT           server only — a mailto: or https: contact URL
 *
 * Generate a pair with `npx web-push generate-vapid-keys`. The public key is
 * public by design; the private key must never reach the browser, which is why
 * it has no VITE_ prefix.
 *
 * Sending lives in src/routes/api/push-dispatch.ts, not here: notifications are
 * written by database triggers, so no application code witnesses them and
 * delivery has to be a separate sweep.
 */

export const VAPID_PUBLIC_KEY = (
  import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ""
).trim();

export function pushConfigured(): boolean {
  return VAPID_PUBLIC_KEY.length > 0;
}

/**
 * The browser's PushManager wants the VAPID key as a Uint8Array, but it is
 * distributed as base64url. Exported because it is fiddly and worth testing:
 * base64url uses `-` and `_` where base64 uses `+` and `/`, and the padding is
 * stripped — feeding the raw string to atob() throws.
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalised);
  // Backed by a concrete ArrayBuffer, not ArrayBufferLike: PushManager's
  // applicationServerKey is typed as BufferSource, which excludes a view that
  // might sit on a SharedArrayBuffer.
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  p256dh: z.string().min(1).max(500),
  auth: z.string().min(1).max(500),
  userAgent: z.string().max(400).optional(),
});

export const savePushSubscription = createServerFn({ method: "POST" })
  .validator((data: unknown) => subscriptionSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "Please sign in again." };

    // Upsert on endpoint: re-subscribing on the same device returns the same
    // endpoint, and two rows would mean the same phone buzzing twice. Also
    // clears failed_at, so a device that went away and came back is live again.
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: data.userAgent ?? null,
        failed_at: null,
      },
      { onConflict: "endpoint" },
    );

    if (error) {
      console.error("[push] save subscription failed:", error.message);
      return { ok: false as const, error: "Could not enable notifications." };
    }
    return { ok: true as const };
  });

export const removePushSubscription = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ endpoint: z.string().url().max(1000) }).parse(data),
  )
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    // "push: unsubscribe own" scopes the delete to the caller's own rows.
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint);

    if (error) {
      console.error("[push] remove subscription failed:", error.message);
      return { ok: false as const, error: "Could not turn those off." };
    }
    return { ok: true as const };
  });

/** How many devices this member currently receives pushes on. */
export const countPushSubscriptions = createServerFn({
  method: "GET",
}).handler(async (): Promise<number> => {
  const supabase = getSupabaseServerClient();
  const { count, error } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .is("failed_at", null);

  if (error) {
    console.error("[push] count failed:", error.message);
    return 0;
  }
  return count ?? 0;
});
