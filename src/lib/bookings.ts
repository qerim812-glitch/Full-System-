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
  notes: string | null;
  confirmation_code: string;
  created_at: string;
  venues?: {
    name: string;
    image_url: string | null;
    address?: string | null;
    opens_at?: string;
    closes_at?: string;
    slot_minutes?: number;
  } | null;
  venue_locations?: { name: string } | null;
};

const BOOKING_COLUMNS =
  "id, venue_slug, location_id, booking_date, booking_time, party_size, status, notes, confirmation_code, created_at, venues(name, image_url, address, opens_at, closes_at, slot_minutes), venue_locations(name)";

export const fetchMyBookings = createServerFn({ method: "GET" }).handler(
  async (): Promise<Booking[]> => {
    const supabase = getSupabaseServerClient();
    // No user_id filter needed: the "bookings: read own" RLS policy scopes
    // this to auth.uid() inside the database.
    const { data, error } = await supabase
      .from("bookings")
      .select(BOOKING_COLUMNS)
      .order("booking_date", { ascending: false })
      .order("booking_time", { ascending: false })
      .limit(300);

    if (error) {
      console.error("[bookings] fetchMyBookings failed:", error.message);
      throw new Error("Could not load your bookings");
    }
    return (data ?? []) as unknown as Booking[];
  },
);

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, "Pick a time");

export const createBookingSchema = z.object({
  venueSlug: z.string().min(1).max(120),
  bookingDate: dateSchema,
  bookingTime: timeSchema,
  partySize: z.coerce
    .number()
    .int()
    .min(1, "At least one person")
    .max(20, "Twenty people maximum"),
  locationId: z.string().uuid().optional().nullable(),
  notes: z
    .string()
    .trim()
    .max(500, "Keep notes under 500 characters")
    .optional(),
});

/**
 * Pure: turns a book_venue()/reschedule_booking() error into user copy.
 * The RPCs raise readable messages for cases the user can act on; anything
 * else is logged and replaced with a generic line.
 */
export function mapBookingError(message: string): string | null {
  if (/bookings_one_per_slot/i.test(message)) {
    return "You already have a booking for that time.";
  }
  if (/rate_limited|too often/i.test(message)) {
    return "You are doing that too often. Please wait a moment.";
  }
  const actionable =
    /seats left|admits ages|signed in|suspended|already passed|in the past|does not belong|not accepting|is open from|90 days|not found|only a confirmed/i.test(
      message,
    );
  return actionable ? message : null;
}

/**
 * Create a booking through the book_venue() RPC.
 *
 * Deliberately NOT a plain insert: the bookings table has no insert policy
 * for users. book_venue() row-locks the venue before counting seats, checks
 * the venue's hours and age limits, and rejects start times already past.
 */
export const createBooking = createServerFn({ method: "POST" })
  .validator((data: unknown) => createBookingSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();

    const { data: booking, error } = await supabase.rpc("book_venue", {
      p_venue_slug: data.venueSlug,
      p_booking_date: data.bookingDate,
      p_booking_time: `${data.bookingTime}:00`,
      p_party_size: data.partySize,
      p_location_id: data.locationId ?? null,
      p_notes: data.notes || null,
    });

    if (error) {
      const message = error.message ?? "";
      const mapped = mapBookingError(message);
      if (mapped) return { ok: false as const, error: mapped };
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
    const { data: rows, error } = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("status", "confirmed")
      .select("id");

    if (error) {
      console.error("[bookings] cancel failed:", error.message);
      return { ok: false as const, error: "Could not cancel that booking." };
    }
    if (!rows || rows.length === 0) {
      return {
        ok: false as const,
        error: "That booking is no longer confirmed.",
      };
    }
    return { ok: true as const };
  });

export const rescheduleSchema = z.object({
  id: z.string().uuid(),
  bookingDate: dateSchema,
  bookingTime: timeSchema,
});

/**
 * Atomic reschedule via reschedule_booking(). The booking keeps its id and
 * confirmation code and only moves if the new slot has room — the previous
 * cancel-then-create implementation lost the booking whenever the second
 * step failed.
 */
export const rescheduleBooking = createServerFn({ method: "POST" })
  .validator((data: unknown) => rescheduleSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { data: booking, error } = await supabase.rpc("reschedule_booking", {
      p_booking_id: data.id,
      p_booking_date: data.bookingDate,
      p_booking_time: `${data.bookingTime}:00`,
    });

    if (error) {
      const mapped = mapBookingError(error.message ?? "");
      if (mapped) return { ok: false as const, error: mapped };
      console.error("[bookings] reschedule failed:", error.message);
      return {
        ok: false as const,
        error: "Could not move the booking. Please try again.",
      };
    }
    return { ok: true as const, booking: booking as Booking };
  });
