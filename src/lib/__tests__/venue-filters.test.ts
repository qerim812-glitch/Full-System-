import { describe, expect, it } from "vitest";

import {
  filterVenues,
  matchesAgeFilter,
  priceBandLabel,
  sortVenues,
} from "@/lib/venue-filters";

const venues = [
  {
    name: "Mulliri",
    description: "Coffee hub",
    min_age: 18,
    max_age: 60,
    capacity: 60,
    category: "cafe",
    average_rating: 4.2,
    review_count: 10,
  },
  {
    name: "Le Chateau",
    description: "Cocktails",
    min_age: 21,
    max_age: 65,
    capacity: 70,
    category: "lounge",
    average_rating: 4.8,
    review_count: 3,
  },
  {
    name: "Moncherie",
    description: "Espresso bar",
    min_age: 18,
    max_age: 35,
    capacity: 45,
    category: "cafe",
    average_rating: null,
    review_count: 0,
  },
];

describe("matchesAgeFilter", () => {
  it("21+ only excludes venues open to 18-year-olds (the old filter matched everything)", () => {
    expect(matchesAgeFilter({ min_age: 18, max_age: 60 }, "21", null)).toBe(
      false,
    );
    expect(matchesAgeFilter({ min_age: 21, max_age: 65 }, "21", null)).toBe(
      true,
    );
  });
  it("'me' uses the member's age window", () => {
    expect(matchesAgeFilter({ min_age: 21, max_age: 65 }, "me", 19)).toBe(
      false,
    );
    expect(matchesAgeFilter({ min_age: 18, max_age: 35 }, "me", 19)).toBe(true);
    expect(matchesAgeFilter({ min_age: 18, max_age: 35 }, "me", 40)).toBe(
      false,
    );
    expect(matchesAgeFilter({ min_age: 21, max_age: 65 }, "me", null)).toBe(
      true,
    );
  });
  it("under-35 crowd uses max_age", () => {
    expect(matchesAgeFilter({ min_age: 18, max_age: 35 }, "u35", null)).toBe(
      true,
    );
    expect(matchesAgeFilter({ min_age: 18, max_age: 60 }, "u35", null)).toBe(
      false,
    );
  });
});

describe("filterVenues + sortVenues", () => {
  it("combines search, capacity, age and category", () => {
    const out = filterVenues(venues, {
      query: "",
      minCapacity: 50,
      age: "any",
      myAge: null,
      category: "all",
    });
    expect(out.map((v) => v.name)).toEqual(["Mulliri", "Le Chateau"]);
    const cafes = filterVenues(venues, {
      query: "bar",
      minCapacity: 0,
      age: "any",
      myAge: null,
      category: "cafe",
    });
    expect(cafes.map((v) => v.name)).toEqual(["Moncherie"]);
  });
  it("sorts by rating with unrated last", () => {
    expect(sortVenues(venues, "rating").map((v) => v.name)).toEqual([
      "Le Chateau",
      "Mulliri",
      "Moncherie",
    ]);
    expect(sortVenues(venues, "capacity").map((v) => v.name)).toEqual([
      "Le Chateau",
      "Mulliri",
      "Moncherie",
    ]);
    expect(sortVenues(venues, "name").map((v) => v.name)).toEqual([
      "Le Chateau",
      "Moncherie",
      "Mulliri",
    ]);
  });
  it("labels price bands", () => {
    expect(priceBandLabel(3)).toBe("€€€");
    expect(priceBandLabel(null)).toBe("€€");
    expect(priceBandLabel(9)).toBe("€€€€");
  });
});
