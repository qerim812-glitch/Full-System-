import { createFileRoute } from "@tanstack/react-router";

import { json, rejectUnlessCron } from "../../lib/cron";
import { getSupabaseServiceRoleClient } from "../../lib/supabase/service-role";

/**
 * Queues day-before reminders — GET or POST /api/reminders.
 *
 * Calls queue_reminders() (migration 0025), which writes one notification per
 * confirmed booking and per meetup guest for tomorrow and stamps the rows so
 * it never repeats. Delivery to phones is /api/push-dispatch's job, as for
 * every other notification. Run hourly; idempotent, so more often is harmless.
 *
 * Authenticated exactly like push-dispatch: Bearer $PUSH_DISPATCH_SECRET.
 */
async function remind(request: Request): Promise<Response> {
  const rejected = rejectUnlessCron(request);
  if (rejected) return rejected;

  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase.rpc("queue_reminders");
  if (error) {
    console.error("[reminders] queue_reminders failed:", error.message);
    return json({ error: "Could not queue reminders" }, 500);
  }
  return json({ ok: true, queued: Number(data ?? 0) }, 200);
}

export const Route = createFileRoute("/api/reminders")({
  server: {
    handlers: {
      POST: ({ request }) => remind(request),
      GET: ({ request }) => remind(request),
    },
  },
});
