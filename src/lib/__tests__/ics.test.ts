import { describe, expect, it } from "vitest";

import { buildIcs, icsLocalStamp } from "@/lib/ics";

// A literal backslash, spelled out so no shell/editor escaping can mangle it.
const BS = String.fromCharCode(92);

describe("buildIcs", () => {
  const ics = buildIcs(
    {
      uid: "abc-123",
      title: "Table at Mulliri, downtown; 2 people",
      description: ["Booking A1B2C3", "Bring ID"].join(String.fromCharCode(10)),
      location: "Blloku, Tirana",
      date: "2026-09-16",
      time: "19:00:00",
      durationMinutes: 90,
    },
    new Date("2026-09-10T10:00:00Z"),
  );

  it("emits a valid VCALENDAR with TZID-qualified local times", () => {
    expect(
      ics.startsWith("BEGIN:VCALENDAR" + String.fromCharCode(13, 10)),
    ).toBe(true);
    expect(ics).toContain("DTSTART;TZID=Europe/Tirane:20260916T190000");
    expect(ics).toContain("DTEND;TZID=Europe/Tirane:20260916T203000");
    expect(ics).toContain("DTSTAMP:20260910T100000Z");
    expect(ics).toContain("UID:abc-123@newpop");
    expect(ics.endsWith("END:VCALENDAR" + String.fromCharCode(13, 10))).toBe(
      true,
    );
  });
  it("escapes commas, semicolons and newlines", () => {
    expect(ics).toContain(
      `SUMMARY:Table at Mulliri${BS}, downtown${BS}; 2 people`,
    );
    expect(ics).toContain(`DESCRIPTION:Booking A1B2C3${BS}nBring ID`);
  });
  it("rolls DTEND over midnight", () => {
    const late = buildIcs({
      uid: "x",
      title: "t",
      date: "2026-12-31",
      time: "23:30",
      durationMinutes: 60,
    });
    expect(late).toContain("DTEND;TZID=Europe/Tirane:20270101T003000");
  });
  it("stamps local times without zone conversion", () => {
    expect(icsLocalStamp("2026-01-05", "08:05")).toBe("20260105T080500");
  });
});
