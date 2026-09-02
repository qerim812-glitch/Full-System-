/**
 * Environment configuration.
 *
 * VITE_-prefixed values are inlined into the browser bundle by Vite and are
 * therefore PUBLIC. That is correct for the Supabase URL and anon key: the
 * anon key is designed to be shipped to browsers, and row-level security is
 * what actually protects the data behind it.
 *
 * SUPABASE_SERVICE_ROLE_KEY has no VITE_ prefix on purpose. It bypasses RLS
 * entirely, so it must never reach the client bundle. It is read only by
 * server-side scripts (see scripts/promote-admin.mjs).
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

export const SUPABASE_URL = required(
  "VITE_SUPABASE_URL",
  import.meta.env.VITE_SUPABASE_URL,
);

export const SUPABASE_ANON_KEY = required(
  "VITE_SUPABASE_ANON_KEY",
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
