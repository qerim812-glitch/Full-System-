import { describe, expect, it } from "vitest";

import {
  INTERESTS,
  MAX_INTERESTS,
  interestLabel,
  sharedInterests,
} from "@/lib/profile";

describe("interest vocabulary", () => {
  it("stays in step with the CHECK constraint in migration 0019", () => {
    // If this fails, the constraint and the UI have drifted: the picker would
    // offer something the database rejects, or hide something it allows.
    expect([...INTERESTS].sort()).toEqual(
      [
        "art",
        "board-games",
        "books",
        "cinema",
        "cocktails",
        "coffee",
        "dancing",
        "fitness",
        "food",
        "football",
        "hiking",
        "languages",
        "live-music",
        "photography",
        "tech",
        "travel",
      ].sort(),
    );
    expect(MAX_INTERESTS).toBe(8);
  });

  it("renders a hyphenated slug as words", () => {
    expect(interestLabel("live-music")).toBe("Live Music");
    expect(interestLabel("coffee")).toBe("Coffee");
  });
});

describe("sharedInterests", () => {
  it("returns the overlap, in the other person's order", () => {
    expect(
      sharedInterests(["coffee", "books"], ["books", "art", "coffee"]),
    ).toEqual(["books", "coffee"]);
  });

  it("is empty when either side has none", () => {
    expect(sharedInterests([], ["coffee"])).toEqual([]);
    expect(sharedInterests(["coffee"], [])).toEqual([]);
    expect(sharedInterests(null, undefined)).toEqual([]);
  });

  it("has no overlap when nothing matches", () => {
    expect(sharedInterests(["coffee"], ["football"])).toEqual([]);
  });
});
