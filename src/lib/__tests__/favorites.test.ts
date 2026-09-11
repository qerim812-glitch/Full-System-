import { describe, expect, it } from "vitest";

import { favoriteSchema, setFavoriteSchema } from "@/lib/favorites";

describe("favoriteSchema", () => {
  it("accepts a normal slug", () => {
    expect(favoriteSchema.parse({ venueSlug: "radio-bar" })).toEqual({
      venueSlug: "radio-bar",
    });
  });

  it("rejects an empty slug", () => {
    expect(() => favoriteSchema.parse({ venueSlug: "" })).toThrow();
  });

  it("rejects a slug beyond the venues.slug length budget", () => {
    expect(() =>
      favoriteSchema.parse({ venueSlug: "x".repeat(121) }),
    ).toThrow();
  });

  it("rejects a missing slug", () => {
    expect(() => favoriteSchema.parse({})).toThrow();
  });
});

describe("setFavoriteSchema", () => {
  it("accepts an explicit favourited state", () => {
    expect(
      setFavoriteSchema.parse({ venueSlug: "radio-bar", favorited: true }),
    ).toEqual({ venueSlug: "radio-bar", favorited: true });
  });

  it("rejects a missing favorited flag", () => {
    expect(() => setFavoriteSchema.parse({ venueSlug: "radio-bar" })).toThrow();
  });
});
