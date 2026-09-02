import { createBrowserClient } from "@supabase/ssr";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../env";

let client: ReturnType<typeof createBrowserClient> | undefined;

/**
 * Browser-side Supabase client, for realtime subscriptions and reads that
 * row-level security already protects.
 *
 * Memoised: creating several clients means several websocket connections and
 * competing token refreshes.
 */
export function getSupabaseBrowserClient() {
  if (!client) {
    client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}
