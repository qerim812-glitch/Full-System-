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
 * What the report is *about*, mirroring the `target_kind` CHECK in
 * 0016_admin_and_donations.sql.
 *
 * reported_user_id / venue_slug say who and where; these two say which piece
 * of content, so the admin queue can show the reported message or review
 * itself instead of only a reason and a uuid.
 */
export const REPORT_TARGET_KINDS = [
  "chat_message",
  "direct_message",
  "review",
  "profile",
  "venue",
  "post",
  "post_comment",
] as const;

export type ReportTargetKind = (typeof REPORT_TARGET_KINDS)[number];

/** The kinds that name a specific row and therefore require a target id. */
const CONTENT_TARGET_KINDS: readonly ReportTargetKind[] = [
  "chat_message",
  "direct_message",
  "review",
  "post",
  "post_comment",
];

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
    targetKind: z.enum(REPORT_TARGET_KINDS).optional(),
    targetId: z.string().uuid().optional(),
  })
  .refine((data) => data.reportedUserId ?? data.venueSlug, {
    message: "A report needs a person or a venue to be about.",
  })
  // Mirrors the reports_target_id_required CHECK: a content kind without an
  // id would be a dead link in the admin queue.
  .refine(
    (data) =>
      !data.targetKind ||
      !CONTENT_TARGET_KINDS.includes(data.targetKind) ||
      Boolean(data.targetId),
    { message: "That report is missing the item it refers to." },
  );

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
      target_kind: data.targetKind ?? null,
      target_id: data.targetId ?? null,
    });

    if (error) {
      console.error("[reports] fileReport failed:", error.message);
      return { ok: false as const, error: mapReportError(error.message) };
    }
    return { ok: true as const };
  });
