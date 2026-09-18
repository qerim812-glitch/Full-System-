import { createServerClient } from "@supabase/ssr";

import { SUPABASE_URL } from "../env";

/**
 * A Supabase client authenticated with the service-role key.
 *
 * This client BYPASSES row-level security completely and can read and write
 * every row in the database, plus the auth admin API. Three rules keep that
 * from becoming a hole:
 *
 *   1. The key is read from `process.env`, never `import.meta.env`, and has no
 *      VITE_ prefix — Vite only inlines VITE_-prefixed values, so it cannot be
 *      baked into the browser bundle.
 *   2. Every caller is either an admin-only server function that has already
 *      awaited `requireAdmin()`, or the Buy Me a Coffee webhook route, which
 *      has verified an HMAC signature before it gets here.
 *   3. Nothing in this module is exported to a component. It is imported only
 *      from server function handlers and route handlers.
 *
 * It is built with @supabase/ssr's `createServerClient`, the same constructor
 * the request-scoped client uses, but handed an empty cookie store. That is
 * what makes it service-role rather than "whoever is signed in": with no
 * session cookie to find, every request goes out authenticated as the key
 * itself. Using the same constructor also keeps its inferred type identical to
 * `getSupabaseServerClient()`, so the two are interchangeable at call sites.
 */
let cached: ReturnType<typeof createServerClient> | null = null;

export function serviceRoleConfigured(): boolean {
  return Boolean(process.env["SUPABASE_SERVICE_ROLE_KEY"]);
}

export function getSupabaseServiceRoleClient() {
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to the server environment " +
        "(Vercel → Project → Settings → Environment Variables) — without the " +
        "VITE_ prefix, so it is never sent to the browser.",
    );
  }
  cached ??= createServerClient(SUPABASE_URL, key, {
    cookies: {
      getAll: () => [],
      setAll: () => {
        /* no session to persist — the key is the credential */
      },
    },
  });
  return cached;
}
