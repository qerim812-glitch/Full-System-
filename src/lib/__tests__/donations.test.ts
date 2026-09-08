import { describe, expect, it } from "vitest";

import {
  donationInputSchema,
  formatAmount,
  toMinorUnits,
} from "@/lib/donations";

describe("toMinorUnits", () => {
  it("converts a whole amount", () => {
    expect(toMinorUnits("12")).toBe(1200);
  });

  it("converts two decimal places", () => {
    expect(toMinorUnits("12.50")).toBe(1250);
  });

  it("pads a single decimal place", () => {
    expect(toMinorUnits("12.5")).toBe(1250);
  });

  it("accepts a comma as the decimal separator", () => {
    // Albanian and most of Europe write 12,50 rather than 12.50.
    expect(toMinorUnits("12,50")).toBe(1250);
  });

  it("avoids binary floating point error", () => {
    // 0.29 * 100 is 28.999999999999996 in IEEE 754; string splitting is exact.
    expect(toMinorUnits("0.29")).toBe(29);
    expect(toMinorUnits("1.15")).toBe(115);
  });

  it("rejects zero and negatives", () => {
    expect(toMinorUnits("0")).toBeNull();
    expect(toMinorUnits("0.00")).toBeNull();
    expect(toMinorUnits("-5")).toBeNull();
  });

  it("rejects more than two decimal places", () => {
    expect(toMinorUnits("1.234")).toBeNull();
  });

  it("rejects non-numeric input", () => {
    expect(toMinorUnits("abc")).toBeNull();
    expect(toMinorUnits("")).toBeNull();
  });
});

describe("formatAmount", () => {
  it("renders minor units as a decimal with the currency", () => {
    expect(formatAmount(1250, "ALL")).toBe("12.50 ALL");
  });

  it("keeps trailing zeroes", () => {
    expect(formatAmount(1200, "EUR")).toBe("12.00 EUR");
  });
});

describe("donationInputSchema", () => {
  const valid = {
    amountMinor: 1250,
    currency: "ALL" as const,
    method: "bank_transfer" as const,
  };

  it("accepts a minimal declaration", () => {
    expect(donationInputSchema.parse(valid).amountMinor).toBe(1250);
  });

  it("rejects a fractional minor amount", () => {
    expect(() =>
      donationInputSchema.parse({ ...valid, amountMinor: 12.5 }),
    ).toThrow();
  });

  it("rejects an unsupported currency", () => {
    expect(() =>
      donationInputSchema.parse({ ...valid, currency: "GBP" }),
    ).toThrow();
  });

  it("rejects a zero amount", () => {
    expect(() =>
      donationInputSchema.parse({ ...valid, amountMinor: 0 }),
    ).toThrow();
  });
});
