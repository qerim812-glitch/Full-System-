import { createFileRoute } from "@tanstack/react-router";

import { getSupabaseServiceRoleClient } from "../../lib/supabase/service-role";

/**
 * Sends queued Web Push notifications — POST /api/push-dispatch.
 *
 * Notifications are written by database triggers, so no application code
 * witnesses them being created. Rather than teach every trigger to make a
 * network call, each row carries `pushed_at` and this endpoint sweeps up the
 * ones still null. That keeps the triggers pure, makes delivery retryable, and
 * means a push outage loses nothing — the rows are still there.
 *
 * Call it on a schedule, e.g. a Vercel cron every minute:
 *
 *   { "crons": [{ "path": "/api/push-dispatch", "schedule": "* * * * *" }] }
 *
 * Vercel cron sends GET, so both verbs are handled.
 *
 * AUTHENTICATION: this runs as the service role, so it must not be open. It
 * requires `Authorization: Bearer $PUSH_DISPATCH_SECRET`, and refuses to run at
 * all when that secret is unset — failing closed rather than exposing an
 * unauthenticated endpoint that can read every member's notifications.
 */

type Subscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Constant-time compare, so the secret cannot be guessed a character at a time. */
function secretMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

const BATCH = 100;

async function dispatch(request: Request): Promise<Response> {
  const secret = process.env["PUSH_DISPATCH_SECRET"];
  const publicKey = process.env["VITE_VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  const subject = process.env["VAPID_SUBJECT"];

  if (!secret) {
    // Fails closed. An unauthenticated endpoint running as service role would
    // be able to read every member's notifications.
    return json({ error: "PUSH_DISPATCH_SECRET is not configured" }, 501);
  }
  if (!publicKey || !privateKey || !subject) {
    return json({ error: "VAPID keys are not configured" }, 501);
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.replace(/^Bearer\s+/i, "");
  if (!provided || !secretMatches(provided, secret)) {
    return json({ error: "Unauthorised" }, 401);
  }

  // Imported lazily so the library is not pulled into the bundle on
  // deployments that never enable push.
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const supabase = getSupabaseServiceRoleClient();

  const { data: pending, error } = await supabase
    .from("notifications")
    .select("id, user_id, title, body, link, kind")
    .is("pushed_at", null)
    // Anything older than a day is not worth waking someone up for.
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString())
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    console.error("[push] could not read the queue:", error.message);
    return json({ error: "Could not read the queue" }, 500);
  }

  const rows = (pending ?? []) as Array<Record<string, unknown>>;
  if (rows.length === 0) return json({ ok: true, sent: 0, pending: 0 }, 200);

  const userIds = [...new Set(rows.map((r) => r["user_id"] as string))];
  const { data: subsData } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", userIds)
    .is("failed_at", null);

  const subsByUser = new Map<string, Subscription[]>();
  for (const row of (subsData ?? []) as Array<Record<string, unknown>>) {
    const userId = row["user_id"] as string;
    const list = subsByUser.get(userId) ?? [];
    list.push({
      id: row["id"] as string,
      endpoint: row["endpoint"] as string,
      p256dh: row["p256dh"] as string,
      auth: row["auth"] as string,
    });
    subsByUser.set(userId, list);
  }

  let sent = 0;
  const deadSubscriptionIds: string[] = [];

  await Promise.all(
    rows.flatMap((row) => {
      const subs = subsByUser.get(row["user_id"] as string) ?? [];
      const payload = JSON.stringify({
        title: row["title"],
        body: row["body"] ?? "",
        url: row["link"] ?? "/feed",
        tag: row["kind"],
      });

      return subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload,
          );
          sent += 1;
        } catch (pushError) {
          const status = (pushError as { statusCode?: number }).statusCode;
          // 404/410 mean the browser threw the subscription away — the device
          // is gone for good, so stop retrying it rather than failing forever.
          if (status === 404 || status === 410) {
            deadSubscriptionIds.push(sub.id);
          } else {
            console.error("[push] send failed:", status, pushError);
          }
        }
      });
    }),
  );

  // Marked as pushed whether or not a subscription existed: a member with no
  // device registered should not leave a row queued forever.
  const now = new Date().toISOString();
  await supabase
    .from("notifications")
    .update({ pushed_at: now })
    .in(
      "id",
      rows.map((r) => r["id"] as string),
    );

  if (deadSubscriptionIds.length > 0) {
    await supabase
      .from("push_subscriptions")
      .update({ failed_at: now })
      .in("id", deadSubscriptionIds);
  }

  return json(
    {
      ok: true,
      sent,
      processed: rows.length,
      retired: deadSubscriptionIds.length,
    },
    200,
  );
}

export const Route = createFileRoute("/api/push-dispatch")({
  server: {
    handlers: {
      POST: ({ request }) => dispatch(request),
      // Vercel cron issues GET.
      GET: ({ request }) => dispatch(request),
    },
  },
});
