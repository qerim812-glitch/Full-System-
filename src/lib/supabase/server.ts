import { createServerClient } from "@supabase/ssr";
import { getCookies, setCookie } from "@tanstack/react-start/server";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../env";

/**
 * A Supabase client bound to the current request's cookies.
 *
 * This is the piece that makes the session a real credential rather than a
 * claim the client asserts about itself. Supabase issues a signed JWT on
 * sign-in; @supabase/ssr writes it to an httpOnly cookie, and every
 * subsequent request carries it back so the server can verify the signature.
 *
 * httpOnly matters: JavaScript on the page cannot read the token, so an XSS
 * bug cannot exfiltrate the session.
 */
export function getSupabaseServerClient() {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return Object.entries(getCookies()).map(([name, value]) => ({
          name,
          value,
        }));
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          setCookie(name, value, {
            ...options,
            httpOnly: true,
            sameSite: "lax",
            secure: process.env["NODE_ENV"] === "production",
            path: "/",
          });
        }
      },
    },
  });
}

/**
 * The signed-in user, verified server-side, or null.
 *
 * Uses getUser() rather than getSession(). getSession() only decodes whatever
 * is in the cookie and does NOT verify it — a forged cookie would pass.
 * getUser() validates the token against Supabase before returning. Anything
 * that gates access must use this.
 */
export async function getCurrentUser() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

/** True when the verified user carries app_metadata.role === "admin". */
export function isAdminUser(
  user: { app_metadata?: Record<string, unknown> } | null,
) {
  if (!user) return false;
  return user.app_metadata?.["role"] === "admin";
}
