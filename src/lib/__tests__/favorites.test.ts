import { describe, expect, it } from "vitest";

import { favoriteSchema } from "@/lib/favorites";

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
