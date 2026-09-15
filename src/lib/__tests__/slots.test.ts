import { describe, expect, it } from "vitest";

import {
  defaultSlot,
  formatHours,
  isSlotPast,
  minutesFromTime,
  venueSlots,
} from "@/lib/slots";

describe("venueSlots", () => {
  it("generates hourly slots up to (not including) closing", () => {
    expect(
      venueSlots({ opens_at: "18:00", closes_at: "23:00", slot_minutes: 60 }),
    ).toEqual(["18:00", "19:00", "20:00", "21:00", "22:00"]);
  });
  it("supports 30-minute steps and Postgres time strings", () => {
    expect(
      venueSlots({
        opens_at: "08:00:00",
        closes_at: "09:30:00",
        slot_minutes: 30,
      }),
    ).toEqual(["08:00", "08:30", "09:00"]);
  });
  it("returns nothing for inverted hours", () => {
    expect(
      venueSlots({ opens_at: "23:00", closes_at: "08:00", slot_minutes: 60 }),
    ).toEqual([]);
  });
});

describe("defaultSlot / isSlotPast", () => {
  const slots = ["18:00", "19:00", "20:00"];
  it("picks the first slot on a future day", () => {
    expect(
      defaultSlot(slots, "2026-09-20", "2026-09-16", minutesFromTime("19:30")),
    ).toBe("18:00");
  });
  it("skips slots already passed today", () => {
    expect(
      defaultSlot(slots, "2026-09-16", "2026-09-16", minutesFromTime("19:30")),
    ).toBe("20:00");
    expect(
      defaultSlot(slots, "2026-09-16", "2026-09-16", minutesFromTime("21:00")),
    ).toBeNull();
  });
  it("flags past slots", () => {
    expect(isSlotPast("2026-09-15", "23:00", "2026-09-16", 0)).toBe(true);
    expect(
      isSlotPast("2026-09-16", "18:00", "2026-09-16", minutesFromTime("18:00")),
    ).toBe(true);
    expect(
      isSlotPast("2026-09-16", "18:00", "2026-09-16", minutesFromTime("17:59")),
    ).toBe(false);
    expect(isSlotPast("2026-09-17", "08:00", "2026-09-16", 1439)).toBe(false);
  });
  it("labels hours", () => {
    expect(
      formatHours({
        opens_at: "08:00:00",
        closes_at: "23:00:00",
        slot_minutes: 60,
      }),
    ).toBe("08:00 – 23:00");
  });
});
