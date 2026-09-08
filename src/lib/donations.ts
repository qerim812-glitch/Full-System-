import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getCurrentUser, getSupabaseServerClient } from "./supabase/server";

export type Donation = {
  id: string;
  amount_minor: number;
  currency: string;
  method: "bank_transfer" | "card" | "other";
  status: "pending" | "confirmed" | "failed" | "refunded";
  message: string | null;
  created_at: string;
};

/** Currencies the UI offers. `currency` is CHAR(3) in the schema. */
export const CURRENCIES = ["ALL", "EUR", "USD"] as const;

/**
 * Money crosses the wire in MINOR units, matching donations.amount_minor.
 *
 * The form collects a decimal ("12.50"), so parsing happens here rather than
 * in the component: binary floating point cannot represent decimal money
 * exactly, so the string is split on the decimal point instead of being
 * multiplied by 100.
 */
export function toMinorUnits(input: string): number | null {
  const trimmed = input.trim().replace(",", ".");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(trimmed)) return null;

  const [whole = "0", fraction = ""] = trimmed.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return minor > 0 ? minor : null;
}

/** Minor units back to a display string. */
export function formatAmount(minor: number, currency: string): string {
  const major = (minor / 100).toFixed(2);
  return `${major} ${currency}`;
}

export const donationInputSchema = z.object({
  // Already in minor units by the time it reaches the server.
  amountMinor: z
    .number()
    .int("Enter a whole amount")
    .positive("Enter an amount greater than zero")
    .max(100_000_000_00, "That amount is too large"),
  currency: z.enum(CURRENCIES),
  method: z.enum(["bank_transfer", "card", "other"]),
  message: z.string().trim().max(1000).optional(),
});

export const fetchMyDonations = createServerFn({ method: "GET" }).handler(
  async (): Promise<Donation[]> => {
    const supabase = getSupabaseServerClient();
    // "donations: read own" scopes this to auth.uid().
    const { data, error } = await supabase
      .from("donations")
      .select("id, amount_minor, currency, method, status, message, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[donations] fetchMyDonations failed:", error.message);
      return [];
    }
    return (data ?? []) as Donation[];
  },
);

/**
 * Record an intended donation.
 *
 * This declares an intent, it does not take money. The row is always created
 * `pending`; only an admin (or a webhook using the service-role key) may move
 * it to confirmed, which is what the "donations: declare own" policy enforces
 * by requiring status = 'pending' in its WITH CHECK.
 */
export const declareDonation = createServerFn({ method: "POST" })
  .validator((data: unknown) => donationInputSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "Please sign in again." };

    const { error } = await supabase.from("donations").insert({
      user_id: user.id,
      donor_email: user.email ?? null,
      amount_minor: data.amountMinor,
      currency: data.currency,
      method: data.method,
      status: "pending",
      message: data.message ?? null,
    });

    if (error) {
      console.error("[donations] declare failed:", error.message);
      return {
        ok: false as const,
        error: "Could not record that donation. Please try again.",
      };
    }
    return { ok: true as const };
  });
