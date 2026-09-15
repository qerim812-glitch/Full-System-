import { describe, expect, it } from "vitest";

import {
  createBookingSchema,
  mapBookingError,
  rescheduleSchema,
} from "@/lib/bookings";

describe("createBookingSchema", () => {
  it("accepts a full booking and coerces party size", () => {
    const parsed = createBookingSchema.parse({
      venueSlug: "mulliri",
      bookingDate: "2026-09-20",
      bookingTime: "19:00",
      partySize: "4",
      locationId: null,
      notes: "  window table ",
    });
    expect(parsed.partySize).toBe(4);
    expect(parsed.notes).toBe("window table");
  });
  it("rejects bad dates, times and party sizes", () => {
    expect(() =>
      createBookingSchema.parse({
        venueSlug: "m",
        bookingDate: "20/09/2026",
        bookingTime: "19:00",
        partySize: 2,
      }),
    ).toThrow();
    expect(() =>
      createBookingSchema.parse({
        venueSlug: "m",
        bookingDate: "2026-09-20",
        bookingTime: "7pm",
        partySize: 2,
      }),
    ).toThrow();
    expect(() =>
      createBookingSchema.parse({
        venueSlug: "m",
        bookingDate: "2026-09-20",
        bookingTime: "19:00",
        partySize: 21,
      }),
    ).toThrow();
  });
  it("rescheduleSchema needs a uuid", () => {
    expect(() =>
      rescheduleSchema.parse({
        id: "nope",
        bookingDate: "2026-09-20",
        bookingTime: "19:00",
      }),
    ).toThrow();
  });
});

describe("mapBookingError", () => {
  it("passes actionable RPC messages through", () => {
    expect(
      mapBookingError("Only 2 of 60 seats left at Mulliri for that time"),
    ).toMatch(/seats left/);
    expect(mapBookingError("This venue admits ages 21 to 65")).toMatch(
      /admits ages/,
    );
    expect(mapBookingError("That time has already passed")).toMatch(
      /already passed/,
    );
    expect(mapBookingError("Mulliri is open from 08:00 to 23:00")).toMatch(
      /is open from/,
    );
  });
  it("maps the unique-slot violation and rate limit", () => {
    expect(
      mapBookingError(
        'duplicate key value violates unique constraint "bookings_one_per_slot"',
      ),
    ).toBe("You already have a booking for that time.");
    expect(
      mapBookingError("You are doing that too often. Please wait a moment."),
    ).toMatch(/too often/);
  });
  it("hides internal errors", () => {
    expect(
      mapBookingError("relation public.bookings does not exist"),
    ).toBeNull();
  });
});
