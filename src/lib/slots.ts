/**
 * Booking time slots derived from a venue's opening hours.
 *
 * Pure — no I/O — so it is unit-tested in src/lib/__tests__/slots.test.ts.
 * Replaces the hard-coded 18:00–23:00 list that every venue used to share,
 * which made a café that opens at 08:00 unbookable before dinner.
 */

export type VenueHours = {
  opens_at: string; // "08:00" or "08:00:00"
  closes_at: string; // "23:00" — last slot starts one slot length before this
  slot_minutes: number;
};

/** Minutes since midnight from "HH:MM" or "HH:MM:SS". */
export function minutesFromTime(time: string): number {
  const [h = "0", m = "0"] = time.split(":");
  return Number(h) * 60 + Number(m);
}

/** "HH:MM" from minutes since midnight. */
export function timeFromMinutes(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * All bookable start times for a venue, e.g. 08:00 → 23:00 every 60 min
 * gives 08:00 … 22:00. The last slot must *start* before closing time.
 */
export function venueSlots(hours: VenueHours): string[] {
  const open = minutesFromTime(hours.opens_at);
  const close = minutesFromTime(hours.closes_at);
  const step = hours.slot_minutes > 0 ? hours.slot_minutes : 60;
  if (close <= open) return [];
  const slots: string[] = [];
  for (let t = open; t < close; t += step) slots.push(timeFromMinutes(t));
  return slots;
}

/**
 * The first slot that is still in the future for `date`, or the first slot
 * of the day when `date` is not today. `nowMinutes` / `todayYmd` are
 * injectable for tests; production callers use Tirana time.
 */
export function defaultSlot(
  slots: readonly string[],
  date: string,
  todayYmd: string,
  nowMinutes: number,
): string | null {
  if (slots.length === 0) return null;
  if (date !== todayYmd) return slots[0] ?? null;
  return slots.find((s) => minutesFromTime(s) > nowMinutes) ?? null;
}

/** True when a YYYY-MM-DD + HH:MM wall-clock moment is already past. */
export function isSlotPast(
  date: string,
  slot: string,
  todayYmd: string,
  nowMinutes: number,
): boolean {
  if (date < todayYmd) return true;
  if (date > todayYmd) return false;
  return minutesFromTime(slot) <= nowMinutes;
}

/** "08:00 – 23:00" label for cards and the admin form. */
export function formatHours(hours: VenueHours): string {
  return `${hours.opens_at.slice(0, 5)} – ${hours.closes_at.slice(0, 5)}`;
}
