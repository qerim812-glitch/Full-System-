import { describe, expect, it } from "vitest";

import { mapReportError, reportInputSchema } from "@/lib/reports";

describe("reportInputSchema", () => {
  it("accepts a report about a venue", () => {
    expect(
      reportInputSchema.parse({ reason: "spam", venueSlug: "radio-bar" }),
    ).toMatchObject({ reason: "spam", venueSlug: "radio-bar" });
  });

  it("accepts a report about a member", () => {
    expect(
      reportInputSchema.parse({
        reason: "harassment",
        reportedUserId: "11111111-1111-1111-1111-111111111111",
      }),
    ).toMatchObject({ reason: "harassment" });
  });

  it("rejects a report with neither a venue nor a member", () => {
    expect(() => reportInputSchema.parse({ reason: "other" })).toThrow();
  });

  it("rejects an unrecognised reason", () => {
    expect(() =>
      reportInputSchema.parse({ reason: "not_a_reason", venueSlug: "x" }),
    ).toThrow();
  });

  it("rejects a description past the 4000-char database ceiling", () => {
    expect(() =>
      reportInputSchema.parse({
        reason: "other",
        venueSlug: "radio-bar",
        description: "x".repeat(4001),
      }),
    ).toThrow();
  });
});

describe("mapReportError", () => {
  it("falls back to generic copy for anything unrecognised", () => {
    expect(mapReportError("connection reset by peer")).toMatch(
      /could not file/i,
    );
  });
});
