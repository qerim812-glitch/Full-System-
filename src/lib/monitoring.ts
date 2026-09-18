/**
 * Error monitoring.
 *
 * Until now a production failure rendered the friendly 500 page in
 * `src/lib/error-page.ts` and then existed only in a hosting log nobody reads.
 * This reports it somewhere you will actually see it.
 *
 * Two deliberate choices:
 *
 *   1. **Entirely optional.** With `VITE_SENTRY_DSN` unset, nothing
 *      initialises and — because the SDK is loaded through a dynamic
 *      `import()` — nothing is even downloaded. A deployment without a Sentry
 *      account carries no cost for this file existing.
 *   2. **No personal data by default.** This app stores private messages,
 *      emails and dates of birth. `sendDefaultPii` stays false and
 *      `beforeSend` strips cookies, auth headers and query strings, so a crash
 *      report cannot quietly become a data export. Only the user id is
 *      attached, and only so a report can be traced back to an account you
 *      already hold.
 *
 * A DSN is safe to expose publicly — it only permits *sending* events — which
 * is why it uses the VITE_ prefix and the same value serves client and server.
 */

type SentryLike = {
  init: (options: Record<string, unknown>) => void;
  captureException: (error: unknown, hint?: Record<string, unknown>) => void;
  setUser: (user: Record<string, unknown> | null) => void;
};

let sentry: SentryLike | null = null;
let initialising: Promise<void> | null = null;

function dsn(): string {
  return (import.meta.env.VITE_SENTRY_DSN ?? "").trim();
}

export function monitoringEnabled(): boolean {
  return dsn().length > 0;
}

/**
 * Strips anything that could carry a session or a message body out of an
 * event before it leaves the process.
 */
function scrub(event: Record<string, unknown>): Record<string, unknown> {
  const request = event["request"] as Record<string, unknown> | undefined;
  if (request) {
    delete request["cookies"];
    delete request["data"];
    delete request["query_string"];
    const headers = request["headers"] as Record<string, string> | undefined;
    if (headers) {
      for (const name of Object.keys(headers)) {
        if (/cookie|authorization|apikey|token/i.test(name)) {
          delete headers[name];
        }
      }
    }
  }
  return event;
}

function baseOptions() {
  return {
    dsn: dsn(),
    environment:
      import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    sendDefaultPii: false,
    // Errors only. Performance tracing multiplies event volume and this is a
    // small app — turn it up deliberately if you ever need it.
    tracesSampleRate: 0,
    beforeSend: (event: Record<string, unknown>) => scrub(event),
  };
}

/** Browser-side init. Safe to call more than once. */
export async function initClientMonitoring(): Promise<void> {
  if (!monitoringEnabled() || sentry || initialising)
    return initialising ?? undefined;
  initialising = import("@sentry/react")
    .then((module) => {
      const client = module as unknown as SentryLike;
      client.init(baseOptions());
      sentry = client;
    })
    .catch((error) => {
      console.warn("[monitoring] client init failed:", error);
    });
  return initialising;
}

/** Server-side init, called once from the SSR entry. */
export async function initServerMonitoring(): Promise<void> {
  if (!monitoringEnabled() || sentry || initialising)
    return initialising ?? undefined;
  initialising = import("@sentry/node")
    .then((module) => {
      const client = module as unknown as SentryLike;
      client.init(baseOptions());
      sentry = client;
    })
    .catch((error) => {
      console.warn("[monitoring] server init failed:", error);
    });
  return initialising;
}

/**
 * Report an error, if monitoring is configured.
 *
 * Never throws and never rejects: this is called from inside catch blocks that
 * are already handling a failure, and a monitoring problem must not replace
 * the original error with a worse one.
 */
export function reportError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!sentry) return;
  try {
    sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    /* monitoring must never become the failure */
  }
}

/** Associates later reports with an account. Pass null on sign-out. */
export function setMonitoringUser(userId: string | null): void {
  if (!sentry) return;
  try {
    // Id only — no email, no name. Enough to find the account in your own
    // database, nothing that turns the crash log into a member list.
    sentry.setUser(userId ? { id: userId } : null);
  } catch {
    /* ignore */
  }
}
