import { getRequestIP } from "@tanstack/react-start/server";

import { getSupabaseServerClient } from "./supabase/server";

/**
 * Rate limiting for the endpoints that run before anyone is signed in.
 *
 * The limits in 0014 are database triggers keyed on `auth.uid()`. Sign-in,
 * sign-up and password reset have no uid and insert no row, so they need this
 * instead: an explicit check against `check_auth_rate()` (0017) before the
 * request is allowed through to Supabase Auth.
 *
 * Every endpoint is limited on two keys at once:
 *
 *   - **by IP**, which stops one machine working through a password list;
 *   - **by email**, which stops a distributed attempt at one specific account,
 *     and stops someone flooding a stranger's inbox with reset mails.
 *
 * Both are checked, so passing one is not enough.
 */

export type AuthAction = "signin" | "signup" | "reset";

type Limit = { max: number; windowSeconds: number };

/**
 * Deliberately generous. These are meant to stop scripted abuse, not to lock
 * out somebody who mistypes a password four times on hotel wifi — which is a
 * real risk when a whole café shares one NAT address.
 */
const LIMITS: Record<AuthAction, { ip: Limit; email: Limit }> = {
  // 20 sign-in attempts per IP per 15 min covers a shared network; 10 per
  // email is well under what a password-guessing run needs.
  signin: {
    ip: { max: 20, windowSeconds: 900 },
    email: { max: 10, windowSeconds: 900 },
  },
  // Account creation is rare and expensive to clean up after.
  signup: {
    ip: { max: 5, windowSeconds: 3600 },
    email: { max: 3, windowSeconds: 3600 },
  },
  // Each one sends an email to somebody's inbox, so this is the tightest.
  reset: {
    ip: { max: 5, windowSeconds: 3600 },
    email: { max: 3, windowSeconds: 3600 },
  },
};

/** Shown to the user. Same text whatever tripped it — see below. */
export const RATE_LIMITED_MESSAGE =
  "Too many attempts. Please wait a few minutes and try again.";

/**
 * The caller's IP.
 *
 * `xForwardedFor` is trusted because this only ever runs behind Vercel, which
 * overwrites the header with the real client address. Running it anywhere a
 * client can set that header itself would make the IP limit forgeable — the
 * email limit is the backstop that still holds if so.
 */
function callerIp(): string | null {
  try {
    return getRequestIP({ xForwardedFor: true }) ?? null;
  } catch {
    return null;
  }
}

async function underLimit(
  key: string,
  action: AuthAction,
  limit: Limit,
): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc("check_auth_rate", {
    p_key: key,
    p_action: action,
    p_max: limit.max,
    p_window_seconds: limit.windowSeconds,
  });

  if (error) {
    // Fail OPEN. A broken rate limiter must not take sign-in down with it;
    // the alternative is that one migration not being applied locks every
    // member out of their account. Logged loudly so it is not silent.
    console.error("[rate-limit] check_auth_rate failed:", error.message);
    return true;
  }
  return data !== false;
}

/**
 * True when the request may proceed.
 *
 * Both keys are always checked rather than short-circuiting on the first
 * failure: each call records the attempt, and skipping the second would let an
 * attacker who is already over the IP limit keep an email key's count frozen.
 */
export async function allowAuthAttempt(
  action: AuthAction,
  email: string | null,
): Promise<boolean> {
  const limits = LIMITS[action];
  const ip = callerIp();

  const checks: Array<Promise<boolean>> = [];
  if (ip) checks.push(underLimit(`ip:${ip}`, action, limits.ip));
  if (email) {
    checks.push(
      underLimit(`email:${email.toLowerCase()}`, action, limits.email),
    );
  }
  if (checks.length === 0) return true;

  const results = await Promise.all(checks);
  return results.every(Boolean);
}
