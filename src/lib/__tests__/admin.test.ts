import { describe, expect, it } from "vitest";

import { escapeSearchTerm, toCsv, venueUpsertSchema } from "@/lib/admin";

describe("toCsv", () => {
  it("quotes cells with commas, quotes and newlines", () => {
    const csv = toCsv(
      ["a", "b"],
      [
        ["x,y", 'say "hi"'],
        ["line\nbreak", null],
      ],
    );
    expect(csv).toBe('a,b\r\n"x,y","say ""hi"""\r\n"line\nbreak",\r\n');
  });
});

describe("escapeSearchTerm", () => {
  it("leaves an ordinary term alone", () => {
    expect(escapeSearchTerm("ana")).toBe("ana");
  });

  it("escapes the characters that would change the PostgREST filter", () => {
    // A bare comma splits `or(...)` into extra filters, and % / _ are ilike
    // wildcards — a search for "a_b" must not match "axb".
    expect(escapeSearchTerm("a,b")).toBe("a\\,b");
    expect(escapeSearchTerm("100%")).toBe("100\\%");
    expect(escapeSearchTerm("a_b")).toBe("a\\_b");
    expect(escapeSearchTerm("f(x)")).toBe("f\\(x\\)");
  });

  it("escapes a backslash so it cannot escape our escaping", () => {
    expect(escapeSearchTerm("a\\b")).toBe("a\\\\b");
  });
});

describe("venueUpsertSchema", () => {
  const base = {
    slug: "mulliri",
    name: "Mulliri",
    description: "Coffee",
    image_url: null,
    location_url: null,
    min_age: 18,
    max_age: 60,
    capacity: 60,
  };
  it("applies defaults for the new columns", () => {
    const v = venueUpsertSchema.parse(base);
    expect(v.category).toBe("cafe");
    expect(v.opens_at).toBe("18:00");
    expect(v.slot_minutes).toBe(60);
    expect(v.price_band).toBe(2);
  });
  it("rejects max_age below min_age and closing before opening", () => {
    expect(() => venueUpsertSchema.parse({ ...base, max_age: 17 })).toThrow(
      /Maximum age/,
    );
    expect(() =>
      venueUpsertSchema.parse({
        ...base,
        opens_at: "20:00",
        closes_at: "19:00",
      }),
    ).toThrow(/Closing time/);
  });
});

describe("venueUpsertSchema — coordinates", () => {
  const base = {
    slug: "mulliri",
    name: "Mulliri",
    description: "Coffee",
    image_url: null,
    location_url: null,
    min_age: 18,
    max_age: 99,
    capacity: 40,
  };

  it("accepts a venue with no coordinates at all", () => {
    expect(venueUpsertSchema.parse(base).lat).toBeUndefined();
  });

  it("accepts a full pair", () => {
    const parsed = venueUpsertSchema.parse({
      ...base,
      lat: 41.3275,
      lng: 19.8187,
    });
    expect(parsed.lat).toBe(41.3275);
  });

  it("rejects half a pair, matching the CHECK in 0021", () => {
    // Postgres' three-valued logic lets `(lat between …) AND (NULL)` pass a
    // CHECK, so both the constraint and this schema state it explicitly.
    expect(() => venueUpsertSchema.parse({ ...base, lat: 41.3275 })).toThrow();
    expect(() => venueUpsertSchema.parse({ ...base, lng: 19.8187 })).toThrow();
    expect(() =>
      venueUpsertSchema.parse({ ...base, lat: 41.3275, lng: null }),
    ).toThrow();
  });

  it("rejects coordinates outside the globe", () => {
    expect(() =>
      venueUpsertSchema.parse({ ...base, lat: 200, lng: 19.8 }),
    ).toThrow();
    expect(() =>
      venueUpsertSchema.parse({ ...base, lat: 41.3, lng: 400 }),
    ).toThrow();
  });
});
