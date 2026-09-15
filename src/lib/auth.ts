import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { z } from "zod";

import {
  getCurrentUser,
  getSupabaseServerClient,
  isAdminUser,
} from "./supabase/server";

const MIN_AGE = 18;

/** Shared password rule. Kept above Supabase's 6-char floor deliberately. */
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be 72 characters or fewer");

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254, "That email address is too long");

/**
 * Absolute origin of the current request, for Supabase's redirect URLs.
 * Derived per request rather than hardcoded so preview deployments and
 * local dev both get links back to themselves. Must also be allow-listed in
 * Supabase → Authentication → URL Configuration.
 */
function siteOrigin(): string {
  const url = getRequestUrl({ xForwardedHost: true, xForwardedProto: true });
  return url.origin;
}

const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});

const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(2, "Enter your name").max(60).optional(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth")
    .refine((value) => {
      const dob = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(dob.getTime()) && dob <= new Date();
    }, "That date is not valid")
    .refine(
      (value) => ageFrom(value) >= MIN_AGE,
      `You must be at least ${MIN_AGE} to join`,
    )
    .refine((value) => ageFrom(value) <= 120, "Check that date of birth"),
});

function ageFrom(isoDate: string): number {
  const dob = new Date(`${isoDate}T00:00:00Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dob.getUTCMonth();
  if (
    monthDelta < 0 ||
    (monthDelta === 0 && now.getUTCDate() < dob.getUTCDate())
  ) {
    age -= 1;
  }
  return age;
}

export type AuthUser = {
  id: string;
  email: string;
  isAdmin: boolean;
};

/**
 * Who is signed in, verified server-side against Supabase.
 *
 * Route guards call this. isAdmin comes from app_metadata, which only the
 * service-role key can write — never from user_metadata, which the user can
 * set themselves through the client SDK.
 */
export const fetchAuthUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuthUser | null> => {
    const user = await getCurrentUser();
    if (!user) return null;
    return {
      id: user.id,
      email: user.email ?? "",
      isAdmin: isAdminUser(user),
    };
  },
);

export const signIn = createServerFn({ method: "POST" })
  .validator((data: unknown) => signInSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { data: result, error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error || !result.user) {
      // One message for both wrong-email and wrong-password. Distinguishing
      // them tells an attacker which emails are registered.
      return { ok: false as const, error: "Email or password is incorrect" };
    }

    return {
      ok: true as const,
      user: {
        id: result.user.id,
        email: result.user.email ?? "",
        isAdmin: isAdminUser(result.user),
      },
    };
  });

export const signUp = createServerFn({ method: "POST" })
  .validator((data: unknown) => signUpSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();

    // date_of_birth and display_name travel in options.data, landing in
    // raw_user_meta_data, where the handle_new_user() trigger reads them to
    // build the profile row. The trigger re-checks the age rule in the
    // database, so it holds even if this validation is bypassed.
    const { data: result, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        emailRedirectTo: `${siteOrigin()}/auth/callback`,
        data: {
          date_of_birth: data.dateOfBirth,
          display_name: data.displayName ?? null,
        },
      },
    });

    if (error) {
      const message = error.message ?? "";

      if (/already registered|already exists|User already/i.test(message)) {
        // Same shape as a successful sign-up so the response does not reveal
        // which addresses are registered. The real owner gets a notice email
        // from Supabase; a stranger learns nothing.
        return {
          ok: true as const,
          needsConfirmation: true,
          user: { id: "", email: data.email, isAdmin: false },
        };
      }
      // Supabase reports a failing profile trigger as an opaque "Database
      // error saving new user". The age rule is the likeliest cause, so say
      // something a person can act on instead of surfacing that string.
      if (/database error/i.test(message)) {
        return {
          ok: false as const,
          error: `Could not create the account. You must be at least ${MIN_AGE} and provide a valid date of birth.`,
        };
      }
      if (/password/i.test(message)) {
        return { ok: false as const, error: message };
      }

      console.error("[auth] signUp failed:", message);
      return {
        ok: false as const,
        error: "Could not create the account. Please try again.",
      };
    }

    if (!result.user) {
      return {
        ok: false as const,
        error: "Could not create the account. Please try again.",
      };
    }

    // needsConfirmation is true when the project requires email verification.
    // No session exists yet in that case, so the UI must not redirect inward.
    return {
      ok: true as const,
      needsConfirmation: result.session === null,
      user: {
        id: result.user.id,
        email: result.user.email ?? "",
        isAdmin: false,
      },
    };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const supabase = getSupabaseServerClient();
  await supabase.auth.signOut();
  return { ok: true as const };
});

const resetSchema = z.object({ email: emailSchema });

export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator((data: unknown) => resetSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    // The link lands on /auth/callback, which exchanges the code for a
    // session and forwards to /reset-password to pick a new password.
    await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${siteOrigin()}/auth/callback?next=/reset-password`,
    });
    // Always the same response, whether or not the address exists. Reporting
    // "no such account" turns this endpoint into a list of your users.
    return {
      ok: true as const,
      message: "If that email has an account, a reset link is on its way.",
    };
  });

const codeSchema = z.object({ code: z.string().min(1).max(512) });

/**
 * Completes a PKCE email link (confirmation or recovery). @supabase/ssr
 * stored the code verifier in a cookie when the email was requested, so the
 * exchange has to happen through the same cookie-bound server client.
 */
export const exchangeAuthCode = createServerFn({ method: "POST" })
  .validator((data: unknown) => codeSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(data.code);
    if (error) {
      console.error("[auth] code exchange failed:", error.message);
      return {
        ok: false as const,
        error: "That link is invalid or has expired. Request a new one.",
      };
    }
    return { ok: true as const };
  });

const newPasswordSchema = z.object({ password: passwordSchema });

/** Set a new password after a recovery link (session already established). */
export const updatePassword = createServerFn({ method: "POST" })
  .validator((data: unknown) => newPasswordSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "You are not signed in." };
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({
      password: data.password,
    });
    if (error) {
      if (/same as|different from the old/i.test(error.message)) {
        return {
          ok: false as const,
          error: "Choose a password you have not used before.",
        };
      }
      console.error("[auth] updatePassword failed:", error.message);
      return { ok: false as const, error: "Could not update the password." };
    }
    return { ok: true as const };
  });

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: passwordSchema,
});

/**
 * Change password from the account page. Runs entirely server-side: the
 * browser client cannot see the httpOnly session cookie, so the previous
 * client-side re-authentication always failed with "not signed in".
 */
export const changePassword = createServerFn({ method: "POST" })
  .validator((data: unknown) => changePasswordSchema.parse(data))
  .handler(async ({ data }) => {
    const user = await getCurrentUser();
    if (!user?.email) {
      return { ok: false as const, error: "You are not signed in." };
    }
    const supabase = getSupabaseServerClient();
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: data.currentPassword,
    });
    if (verifyError) {
      return { ok: false as const, error: "Current password is incorrect." };
    }
    const { error } = await supabase.auth.updateUser({
      password: data.newPassword,
    });
    if (error) {
      if (/same as|different from the old/i.test(error.message)) {
        return {
          ok: false as const,
          error: "The new password must differ from the current one.",
        };
      }
      console.error("[auth] changePassword failed:", error.message);
      return { ok: false as const, error: "Could not change the password." };
    }
    return { ok: true as const };
  });
