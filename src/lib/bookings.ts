import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getSupabaseServerClient } from "./supabase/server";

export type Booking = {
  id: string;
  venue_slug: string;
  location_id: string | null;
  booking_date: string;
  booking_time: string;
  party_size: number;
  status: "confirmed" | "cancelled" | "completed";
  created_at: string;
  venues?: { name: string; image_url: string | null } | null;
  venue_locations?: { name: string } | null;
};

export const fetchMyBookings = createServerFn({ method: "GET" }).handler(
  async (): Promise<Booking[]> => {
    const supabase = getSupabaseServerClient();
    // No user_id filter needed: the "bookings: read own" RLS policy scopes
    // this to auth.uid() inside the database.
    const { data, error } = await supabase
      .from("bookings")
      .select(
        "id, venue_slug, location_id, booking_date, booking_time, party_size, status, created_at, venues(name, image_url), venue_locations(name)",
      )
      .order("booking_date", { ascending: false })
      .order("booking_time", { ascending: false });

    if (error) {
      console.error("[bookings] fetchMyBookings failed:", error.message);
      throw new Error("Could not load your bookings");
    }
    return (data ?? []) as unknown as Booking[];
  },
);

const createSchema = z.object({
  venueSlug: z.string().min(1).max(120),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  bookingTime: z.string().regex(/^\d{2}:\d{2}$/, "Pick a time"),
  partySize: z.coerce
    .number()
    .int()
    .min(1, "At least one person")
    .max(20, "Twenty people maximum"),
  locationId: z.string().uuid().optional().nullable(),
});

/**
 * Create a booking through the book_venue() RPC.
 *
 * Deliberately NOT a plain insert. The bookings table has no insert policy
 * for users, so the client cannot write it directly. book_venue() row-locks
 * the venue before counting seats, which is what stops two people taking the
 * last table at the same instant, and it re-checks the venue's age limits
 * against the stored date of birth.
 */
export const createBooking = createServerFn({ method: "POST" })
  .validator((data: unknown) => createSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();

    const { data: booking, error } = await supabase.rpc("book_venue", {
      p_venue_slug: data.venueSlug,
      p_booking_date: data.bookingDate,
      p_booking_time: `${data.bookingTime}:00`,
      p_party_size: data.partySize,
      p_location_id: data.locationId ?? null,
    });

    if (error) {
      // book_venue() raises human-readable messages for the cases a user can
      // actually act on (capacity, age limits, past dates), so pass those
      // through rather than replacing them with something generic.
      const message = error.message ?? "";
      const actionable =
        /seats left|admits ages|signed in|suspended|in the past|does not belong|not accepting/i.test(
          message,
        );

      if (/bookings_one_per_slot/i.test(message)) {
        return {
          ok: false as const,
          error: "You already have a booking for that time.",
        };
      }
      if (actionable) {
        return { ok: false as const, error: message };
      }

      console.error("[bookings] createBooking failed:", message);
      return {
        ok: false as const,
        error: "Could not complete the booking. Please try again.",
      };
    }

    return { ok: true as const, booking: booking as Booking };
  });

const cancelSchema = z.object({ id: z.string().uuid() });

export const cancelBooking = createServerFn({ method: "POST" })
  .validator((data: unknown) => cancelSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    // The "bookings: cancel own" policy means someone else's id simply
    // matches no row rather than erroring.
    const { error } = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("status", "confirmed");

    if (error) {
      console.error("[bookings] cancel failed:", error.message);
      return { ok: false as const, error: "Could not cancel that booking." };
    }
    return { ok: true as const };
  });
