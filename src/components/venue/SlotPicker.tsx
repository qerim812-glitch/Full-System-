import { useEffect, useState } from "react";

import { isSlotPast } from "../../lib/slots";
import { nowMinutesInTirana, todayInTirana } from "../../lib/utils";
import { fetchAvailability } from "../../lib/venues";
import { Chip } from "../PageChrome";

type Availability = {
  booking_time: string;
  seats_taken: number;
  seats_left: number;
};

/**
 * Time-slot chips with live seats-left counts for one date. Slots come from
 * the venue's opening hours (see lib/slots.ts); slots already in the past
 * for today are disabled.
 */
export function SlotPicker({
  venueSlug,
  date,
  slots,
  selected,
  capacity,
  onSelect,
  excludeBookingId,
}: {
  venueSlug: string;
  date: string;
  slots: readonly string[];
  selected: string | null;
  capacity: number;
  onSelect: (slot: string) => void;
  /** When rescheduling, the current slot still counts this party — ignore it. */
  excludeBookingId?: string;
}) {
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    setLoading(true);
    fetchAvailability({ data: { slug: venueSlug, date } })
      .then((rows) => {
        if (!cancelled) setAvailability(rows);
      })
      .catch(() => {
        if (!cancelled) setAvailability([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [venueSlug, date, excludeBookingId]);

  const slotsLeft = new Map(
    availability.map((r) => [r.booking_time.slice(0, 5), r.seats_left]),
  );
  const today = todayInTirana();
  const nowMin = nowMinutesInTirana();

  if (slots.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        This venue has no bookable hours configured.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Time">
      {slots.map((slot) => {
        const left = slotsLeft.has(slot)
          ? (slotsLeft.get(slot) ?? 0)
          : capacity;
        const past = isSlotPast(date, slot, today, nowMin);
        const full = left <= 0;
        const low = !full && left <= Math.ceil(capacity * 0.2);
        const disabled = full || past;
        const active = selected === slot;

        return (
          <Chip
            key={slot}
            active={active}
            disabled={disabled}
            onClick={() => onSelect(slot)}
            title={past ? "Already passed" : full ? "Fully booked" : undefined}
            className="flex min-w-[4.25rem] flex-col items-center rounded-2xl px-3 py-2"
          >
            <span className={full ? "line-through" : undefined}>{slot}</span>
            <span
              className={`mt-0.5 text-[11px] font-semibold ${
                active
                  ? "text-primary-foreground/70"
                  : past
                    ? "text-muted-foreground/60"
                    : low
                      ? "text-destructive"
                      : "text-muted-foreground"
              }`}
            >
              {loading ? "…" : past ? "past" : full ? "full" : `${left} left`}
            </span>
          </Chip>
        );
      })}
    </div>
  );
}
