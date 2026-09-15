/**
 * Minimal iCalendar (RFC 5545) builder for "Add to calendar" on a booking.
 * Pure — tested in src/lib/__tests__/ics.test.ts.
 */

export type IcsEvent = {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  /** YYYY-MM-DD wall-clock date in Europe/Tirane */
  date: string;
  /** HH:MM or HH:MM:SS wall-clock time in Europe/Tirane */
  time: string;
  durationMinutes?: number;
  url?: string;
};

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local (floating, TZID-qualified) timestamp: 20260916T190000 */
export function icsLocalStamp(date: string, time: string): string {
  const [y, m, d] = date.split("-");
  const [hh = "00", mm = "00"] = time.split(":");
  return `${y}${m}${d}T${hh}${mm}00`;
}

function addMinutes(date: string, time: string, minutes: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh = 0, mm = 0] = time.split(":").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, hh, mm));
  dt.setUTCMinutes(dt.getUTCMinutes() + minutes);
  const ymd = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  const hm = `${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}`;
  return icsLocalStamp(ymd, hm);
}

/** Fold lines at 75 octets as the RFC requires. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    out.push(rest.slice(0, 75));
    rest = " " + rest.slice(75);
  }
  out.push(rest);
  return out.join("\r\n");
}

export function buildIcs(event: IcsEvent, now: Date = new Date()): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NewPop//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}@newpop`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Europe/Tirane:${icsLocalStamp(event.date, event.time)}`,
    `DTEND;TZID=Europe/Tirane:${addMinutes(event.date, event.time, event.durationMinutes ?? 90)}`,
    `SUMMARY:${escapeText(event.title)}`,
  ];
  if (event.description)
    lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.url) lines.push(`URL:${event.url}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Browser-only: trigger a download of the .ics file. */
export function downloadIcs(filename: string, ics: string) {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
