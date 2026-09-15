import { Link, useRouter } from "@tanstack/react-router";
import { CalendarPlus, Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { createBooking, type Booking } from "../../lib/bookings";
import { buildIcs, downloadIcs } from "../../lib/ics";
import { defaultSlot, venueSlots } from "../../lib/slots";
import {
  formatBookingDate,
  nowMinutesInTirana,
  todayInTirana,
} from "../../lib/utils";
import type { Venue, VenueLocation } from "../../lib/venues";
import { Chip, pillClass, primaryPillClass } from "../PageChrome";
import { Alert, AlertDescription } from "../ui/alert";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { SlotPicker } from "./SlotPicker";

/** The "Book a table" card on the venue page. */
export function BookingForm({
  venue,
  locations,
  date,
  onDateChange,
  id,
}: {
  venue: Venue;
  locations: VenueLocation[];
  date: string;
  onDateChange: (next: string) => void;
  id?: string;
}) {
  const router = useRouter();
  const slots = useMemo(() => venueSlots(venue), [venue]);
  const [time, setTime] = useState<string | null>(() =>
    defaultSlot(slots, date, todayInTirana(), nowMinutesInTirana()),
  );
  const [partySize, setPartySize] = useState(2);
  const [locationId, setLocationId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);

  // Any change to the request clears the previous result.
  useEffect(() => {
    setSuccess(null);
    setError(null);
  }, [date, time, partySize, locationId]);

  // Reset to a sensible slot when the date changes.
  useEffect(() => {
    setTime((current) => {
      const next = defaultSlot(
        slots,
        date,
        todayInTirana(),
        nowMinutesInTirana(),
      );
      if (current && slots.includes(current)) {
        return date === todayInTirana() && next && current < next
          ? next
          : current;
      }
      return next;
    });
  }, [date, slots]);

  const maxDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d.toISOString().slice(0, 10);
  }, []);

  async function handleBook(event: React.FormEvent) {
    event.preventDefault();
    if (!time) {
      setError("Pick a time.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await createBooking({
        data: {
          venueSlug: venue.slug,
          bookingDate: date,
          bookingTime: time,
          partySize,
          locationId: locationId || null,
          notes: notes.trim() || undefined,
        },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(result.booking);
      setNotes("");
      await router.invalidate();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function addToCalendar(booking: Booking) {
    const location = locations.find((l) => l.id === booking.location_id);
    downloadIcs(
      `newpop-${venue.slug}-${booking.booking_date}`,
      buildIcs({
        uid: booking.id,
        title: `Table at ${venue.name}`,
        description: `Booking ${booking.confirmation_code} for ${booking.party_size} — NewPop`,
        location: [location?.name, venue.address ?? venue.name]
          .filter(Boolean)
          .join(", "),
        date: booking.booking_date,
        time: booking.booking_time,
        durationMinutes: venue.slot_minutes,
      }),
    );
  }

  return (
    <form
      id={id}
      onSubmit={handleBook}
      className="flex scroll-mt-24 flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
      aria-labelledby={`${id ?? "booking"}-title`}
    >
      <h2
        id={`${id ?? "booking"}-title`}
        className="text-base font-semibold text-foreground"
      >
        Book a table
      </h2>

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {success ? (
        <Alert role="status" className="border-accent bg-accent/20">
          <AlertDescription className="flex flex-col gap-2">
            <span>
              Booked for {formatBookingDate(success.booking_date)} at{" "}
              {success.booking_time.slice(0, 5)}. Confirmation code{" "}
              <strong className="font-mono">{success.confirmation_code}</strong>
              .
            </span>
            <span className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => addToCalendar(success)}
                className={pillClass("gap-1.5 text-xs")}
              >
                <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
                Add to calendar
              </button>
              <Link to="/bookings" className={pillClass("text-xs")}>
                View bookings
              </Link>
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      {locations.length > 0 ? (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-xs font-medium text-foreground">
            Branch
          </legend>
          <div className="flex flex-wrap gap-2">
            <Chip active={locationId === ""} onClick={() => setLocationId("")}>
              Any
            </Chip>
            {locations.map((loc) => (
              <Chip
                key={loc.id}
                active={locationId === loc.id}
                onClick={() => setLocationId(loc.id)}
                title={loc.address ?? undefined}
              >
                {loc.name}
              </Chip>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor={`${id ?? "booking"}-date`}
          className="text-xs font-medium"
        >
          Date
        </Label>
        <Input
          id={`${id ?? "booking"}-date`}
          type="date"
          required
          min={todayInTirana()}
          max={maxDate}
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          className="rounded-xl"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground">Time</span>
        <SlotPicker
          venueSlug={venue.slug}
          date={date}
          slots={slots}
          selected={time}
          capacity={venue.capacity}
          onSelect={setTime}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span
          id={`${id ?? "booking"}-party-label`}
          className="text-xs font-medium text-foreground"
        >
          People
        </span>
        <div
          className="flex items-center gap-3"
          role="group"
          aria-labelledby={`${id ?? "booking"}-party-label`}
        >
          <button
            type="button"
            onClick={() => setPartySize((n) => Math.max(1, n - 1))}
            aria-label="Fewer people"
            disabled={partySize <= 1}
            className={pillClass("h-9 w-9 px-0")}
          >
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <output
            aria-live="polite"
            className="w-8 text-center text-sm font-semibold tabular-nums text-foreground"
          >
            {partySize}
          </output>
          <button
            type="button"
            onClick={() => setPartySize((n) => Math.min(20, n + 1))}
            aria-label="More people"
            disabled={partySize >= 20}
            className={pillClass("h-9 w-9 px-0")}
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor={`${id ?? "booking"}-notes`}
          className="text-xs font-medium"
        >
          Special requests{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id={`${id ?? "booking"}-notes`}
          value={notes}
          maxLength={500}
          rows={2}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Birthday, window table, high chair…"
          className="rounded-xl"
        />
      </div>

      <button
        type="submit"
        disabled={busy || !time}
        className={primaryPillClass("mt-1 w-full py-2.5")}
      >
        {busy ? "Booking…" : "Confirm booking"}
      </button>

      <p className="text-center text-xs text-muted-foreground">
        Age limits and remaining seats are checked when you confirm.
      </p>
    </form>
  );
}
