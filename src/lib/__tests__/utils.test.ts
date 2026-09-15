import { describe, expect, it } from "vitest";

import {
  ageFromDob,
  formatBookingDate,
  formatDate,
  formatRelative,
  formatSlot,
  safeRedirect,
} from "@/lib/utils";

describe("safeRedirect", () => {
  it("keeps same-origin paths", () => {
    expect(safeRedirect("/bookings")).toBe("/bookings");
    expect(safeRedirect("/venues/mulliri?x=1")).toBe("/venues/mulliri?x=1");
  });
  it("rejects protocol-relative and absolute URLs", () => {
    expect(safeRedirect("//evil.com")).toBe("/venues");
    expect(safeRedirect("https://evil.com")).toBe("/venues");
    expect(safeRedirect("/\\evil.com")).toBe("/venues");
  });
  it("falls back when empty", () => {
    expect(safeRedirect(undefined)).toBe("/venues");
    expect(safeRedirect("", "/account")).toBe("/account");
  });
});

describe("date formatting is locale + time-zone pinned", () => {
  it("formats an ISO timestamp in Tirana time", () => {
    // 22:30 UTC on 15 Sep is 00:30 on 16 Sep in Tirana (UTC+2 in summer).
    expect(formatDate("2026-09-15T22:30:00Z")).toBe("16 Sept 2026");
  });
  it("keeps a wall-clock booking date stable", () => {
    expect(formatBookingDate("2026-09-16")).toBe("Wed, 16 Sept 2026");
    expect(formatBookingDate("not-a-date")).toBe("not-a-date");
  });
  it("trims seconds from a Postgres time", () => {
    expect(formatSlot("19:00:00")).toBe("19:00");
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-09-16T12:00:00Z");
  it("handles the common buckets", () => {
    expect(formatRelative("2026-09-16T11:59:40Z", now)).toBe("just now");
    expect(formatRelative("2026-09-16T11:55:00Z", now)).toBe("5 min ago");
    expect(formatRelative("2026-09-16T09:00:00Z", now)).toBe("3 h ago");
    expect(formatRelative("2026-09-15T12:00:00Z", now)).toBe("Yesterday");
    expect(formatRelative("2026-09-13T12:00:00Z", now)).toBe("3 days ago");
    expect(formatRelative("2026-08-01T12:00:00Z", now)).toBe("1 Aug 2026");
  });
});

describe("ageFromDob", () => {
  const today = new Date("2026-09-16T00:00:00Z");
  it("counts whole years, birthday inclusive", () => {
    expect(ageFromDob("2008-09-16", today)).toBe(18);
    expect(ageFromDob("2008-09-17", today)).toBe(17);
    expect(ageFromDob("2000-01-01", today)).toBe(26);
  });
  it("returns 0 for garbage", () => {
    expect(ageFromDob("nope", today)).toBe(0);
  });
});
