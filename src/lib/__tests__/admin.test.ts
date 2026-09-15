import { describe, expect, it } from "vitest";

import { toCsv, venueUpsertSchema } from "@/lib/admin";

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
