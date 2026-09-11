import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getCurrentUser, getSupabaseServerClient } from "./supabase/server";

/** Mirrors the `reason` CHECK constraint in supabase/migrations/0007_moderation.sql. */
export const REPORT_REASONS = [
  "inappropriate_behavior",
  "spam",
  "harassment",
  "fake_profile",
  "safety_concern",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

/**
 * At least one of reportedUserId/venueSlug, mirroring the
 * `reports_has_subject` CHECK constraint — enforced again here so the form
 * fails fast with a clear message instead of a raw Postgres error.
 */
export const reportInputSchema = z
  .object({
    reason: z.enum(REPORT_REASONS),
    description: z.string().trim().max(4000).optional(),
    reportedUserId: z.string().uuid().optional(),
    venueSlug: z.string().min(1).max(120).optional(),
  })
  .refine((data) => data.reportedUserId ?? data.venueSlug, {
    message: "A report needs a person or a venue to be about.",
  });

/**
 * Maps a Postgres rejection to copy a reporter can act on. The two rejection
 * shapes both come from the "reports: file own" policy: reporting yourself,
 * or (defensively) any other RLS mismatch.
 */
export function mapReportError(message: string): string {
  if (/row-level security/i.test(message)) {
    return "That report could not be filed.";
  }
  if (/char_length|description/i.test(message)) {
    return "That description is too long.";
  }
  return "Could not file the report. Please try again.";
}

export const fileReport = createServerFn({ method: "POST" })
  .validator((data: unknown) => reportInputSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "Please sign in again." };

    if (data.reportedUserId === user.id) {
      return {
        ok: false as const,
        error: "You cannot report yourself.",
      };
    }

    const { error } = await supabase.from("reports").insert({
      reporter_id: user.id,
      reported_user_id: data.reportedUserId ?? null,
      venue_slug: data.venueSlug ?? null,
      reason: data.reason,
      description: data.description ?? null,
    });

    if (error) {
      console.error("[reports] fileReport failed:", error.message);
      return { ok: false as const, error: mapReportError(error.message) };
    }
    return { ok: true as const };
  });
