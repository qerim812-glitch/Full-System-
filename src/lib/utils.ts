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
