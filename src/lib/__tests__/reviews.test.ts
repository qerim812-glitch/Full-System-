import { describe, expect, it } from "vitest";

import {
  mapReviewError,
  reviewInputSchema,
  summarizeReviews,
} from "@/lib/reviews";

describe("reviewInputSchema", () => {
  it("accepts a rating with no comment", () => {
    expect(
      reviewInputSchema.parse({ venueSlug: "radio-bar", rating: 4 }),
    ).toMatchObject({ venueSlug: "radio-bar", rating: 4 });
  });

  it("coerces a string rating from a form field", () => {
    expect(
      reviewInputSchema.parse({ venueSlug: "radio-bar", rating: "5" }).rating,
    ).toBe(5);
  });

  it("rejects a rating outside 1-5", () => {
    expect(() =>
      reviewInputSchema.parse({ venueSlug: "radio-bar", rating: 6 }),
    ).toThrow();
    expect(() =>
      reviewInputSchema.parse({ venueSlug: "radio-bar", rating: 0 }),
    ).toThrow();
  });

  it("rejects a comment past the 2000-char database ceiling", () => {
    expect(() =>
      reviewInputSchema.parse({
        venueSlug: "radio-bar",
        rating: 3,
        comment: "x".repeat(2001),
      }),
    ).toThrow();
  });
});

describe("mapReviewError", () => {
  it("explains an RLS rejection as the visit requirement", () => {
    const copy = mapReviewError(
      'new row violates row-level security policy for table "reviews"',
    );
    expect(copy).toMatch(/visit/i);
  });

  it("falls back to generic copy for anything unrecognised", () => {
    expect(mapReviewError("connection reset by peer")).toMatch(
      /could not save/i,
    );
  });
});

describe("summarizeReviews", () => {
  it("returns a null average with no reviews", () => {
    expect(summarizeReviews([])).toEqual({ count: 0, average: null });
  });

  it("averages ratings", () => {
    expect(summarizeReviews([{ rating: 5 }, { rating: 4 }])).toEqual({
      count: 2,
      average: 4.5,
    });
  });
});
