import { describe, expect, it } from "vitest";

import en from "@/i18n/en.json";
import sq from "@/i18n/sq.json";
import { DEFAULT_LOCALE, LOCALES, isLocale, translate } from "@/i18n";

describe("catalogues", () => {
  it("has the same keys in every language", () => {
    // A key present in one catalogue and missing from the other is a string
    // that silently falls back to English for half the users.
    expect(Object.keys(sq).sort()).toEqual(Object.keys(en).sort());
  });

  it("has no empty translations", () => {
    for (const [key, value] of Object.entries(sq)) {
      expect(value, `sq.${key} is empty`).not.toBe("");
    }
  });

  it("keeps the same placeholders on both sides", () => {
    // A translator dropping {{count}} would render "left" with no number.
    const placeholders = (text: string) =>
      (text.match(/\{\{(\w+)\}\}/g) ?? []).sort();
    for (const key of Object.keys(en)) {
      expect(
        placeholders(sq[key as keyof typeof sq]),
        `placeholders differ for ${key}`,
      ).toEqual(placeholders(en[key as keyof typeof en]));
    }
  });

  it("defaults to Albanian — this is a Tirana product", () => {
    expect(DEFAULT_LOCALE).toBe("sq");
    expect(LOCALES).toContain("en");
  });
});

describe("translate", () => {
  it("returns the string for the active locale", () => {
    expect(translate("en", "meetups.join")).toBe("Join");
    expect(translate("sq", "meetups.join")).toBe("Bashkohu");
  });

  it("interpolates variables", () => {
    expect(translate("en", "meetups.seatsLeft", { count: 3 })).toBe("3 left");
    expect(translate("sq", "meetups.seatsLeft", { count: 3 })).toBe(
      "3 të lira",
    );
  });

  it("leaves an unknown placeholder untouched rather than printing undefined", () => {
    expect(translate("en", "meetups.goingOf", { going: 2 })).toBe(
      "2 of {{capacity}} going",
    );
  });

  it("falls back to the key, so a missing string is visible in review", () => {
    expect(translate("sq", "nothing.here")).toBe("nothing.here");
  });
});

describe("isLocale", () => {
  it("accepts supported locales only", () => {
    expect(isLocale("sq")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
