import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Today's date as YYYY-MM-DD in Tirana wall-clock time, not UTC.
 *
 * booking_date is a Tirana wall-clock date (see supabase/README.md), and
 * `new Date().toISOString().slice(0, 10)` is a UTC calendar date instead —
 * for roughly the hour or two around local midnight (Tirana is UTC+1/+2)
 * that disagrees with Tirana's actual date, so it must not be used for
 * anything compared against booking_date.
 */
export function todayInTirana(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Tirane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export const TIRANA_TZ = "Europe/Tirane";

/**
 * Only allow same-origin relative paths as post-login redirect targets.
 * `//evil.com` and `https://…` would otherwise turn /login into an open
 * redirect. Anything that is not a plain in-app path falls back.
 */
export function safeRedirect(
  value: string | undefined | null,
  fallback = "/venues",
): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return fallback;
  return value;
}

/*
 * Date formatting. Every helper pins locale + time zone so the string the
 * server renders during SSR is byte-identical to what the browser renders
 * on hydration; `toLocaleDateString()` with no arguments differs between
 * the two and produces React hydration warnings.
 */
const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIRANA_TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
});
const DATE_LONG_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIRANA_TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIRANA_TZ,
  hour: "2-digit",
  minute: "2-digit",
});
const DATETIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIRANA_TZ,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** "16 Sept 2026" from an ISO timestamp. */
export function formatDate(iso: string | Date): string {
  return DATE_FMT.format(typeof iso === "string" ? new Date(iso) : iso);
}

/** "Wed, 16 Sept 2026" from a YYYY-MM-DD wall-clock date (no TZ shift). */
export function formatBookingDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  // Noon UTC keeps the calendar day stable in every zone we format for.
  return DATE_LONG_FMT.format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** "21:30" from an ISO timestamp. */
export function formatTime(iso: string | Date): string {
  return TIME_FMT.format(typeof iso === "string" ? new Date(iso) : iso);
}

/** "16 Sept, 21:30" from an ISO timestamp. */
export function formatDateTime(iso: string | Date): string {
  return DATETIME_FMT.format(typeof iso === "string" ? new Date(iso) : iso);
}

/** "HH:MM" from a Postgres time value like "19:00:00". */
export function formatSlot(time: string): string {
  return time.slice(0, 5);
}

/**
 * Relative label for feeds and inboxes: "just now", "5 min ago", "2 h ago",
 * "Yesterday", else a short date. `now` is injectable for tests.
 */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDate(then);
}

/** Age in whole years from a YYYY-MM-DD date of birth, as of `today`. */
export function ageFromDob(dob: string, today: Date = new Date()): number {
  const [y, m, d] = dob.split("-").map(Number);
  if (!y || !m || !d) return 0;
  let age = today.getUTCFullYear() - y;
  const monthDelta = today.getUTCMonth() + 1 - m;
  if (monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < d)) age -= 1;
  return age;
}

/** Minutes since midnight, Tirana wall clock. Pairs with todayInTirana(). */
export function nowMinutesInTirana(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIRANA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}
