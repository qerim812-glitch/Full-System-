import { createServerFn } from "@tanstack/react-start";
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
        data: {
          date_of_birth: data.dateOfBirth,
          display_name: data.displayName ?? null,
        },
      },
    });

    if (error) {
      const message = error.message ?? "";

      if (/already registered|already exists|User already/i.test(message)) {
        return {
          ok: false as const,
          error: "An account with this email already exists",
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
    await supabase.auth.resetPasswordForEmail(data.email);
    // Always the same response, whether or not the address exists. Reporting
    // "no such account" turns this endpoint into a list of your users.
    return {
      ok: true as const,
      message: "If that email has an account, a reset link is on its way.",
    };
  });
