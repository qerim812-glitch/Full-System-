/**
 * Shared guard for the scheduled endpoints under /api.
 *
 * They run as the service role, so they must not be open. Each requires
 * `Authorization: Bearer $PUSH_DISPATCH_SECRET` and refuses to run at all when
 * the secret is unset — failing closed rather than exposing an endpoint that
 * can read every member's data. Vercel cron sends the header when the
 * project's `CRON_SECRET`-style env is wired; see vercel.json.
 */

export function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Constant-time compare, so the secret cannot be guessed a character at a time. */
export function secretMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/** Null when the caller may proceed; otherwise the response to return. */
export function rejectUnlessCron(request: Request): Response | null {
  const secret = process.env["PUSH_DISPATCH_SECRET"];
  if (!secret) {
    return json({ error: "PUSH_DISPATCH_SECRET is not configured" }, 501);
  }
  const header = request.headers.get("authorization") ?? "";
  const provided = header.replace(/^Bearer\s+/i, "");
  if (!provided || !secretMatches(provided, secret)) {
    return json({ error: "Unauthorised" }, 401);
  }
  return null;
}
