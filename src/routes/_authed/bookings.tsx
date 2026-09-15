import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { CalendarPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmButton } from "../../components/ConfirmButton";
import { EmptyState } from "../../components/EmptyState";
import {
  PageHeader,
  RouteError,
  pillClass,
  primaryPillClass,
} from "../../components/PageChrome";
import {
  BookingRowSkeletonList,
  StatChipSkeleton,
} from "../../components/Skeletons";
import { StatChip } from "../../components/StatChip";
import { SlotPicker } from "../../components/venue/SlotPicker";
import {
  cancelBooking,
  fetchMyBookings,
  rescheduleBooking,
  type Booking,
} from "../../lib/bookings";
import { buildIcs, downloadIcs } from "../../lib/ics";
import { pageHead } from "../../lib/seo";
import { isSlotPast, venueSlots } from "../../lib/slots";
import {
  formatBookingDate,
  formatSlot,
  nowMinutesInTirana,
  todayInTirana,
} from "../../lib/utils";

export const Route = createFileRoute("/_authed/bookings")({
  loader: async () => ({ bookings: await fetchMyBookings() }),
  head: () => pageHead("My bookings"),
  pendingComponent: BookingsSkeleton,
  component: BookingsPage,
  errorComponent: () => (
    <RouteError
      title="Could not load your bookings"
      body="Please refresh the page to try again."
    />
  ),
});

function BookingsSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy>
      <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
      <StatChipSkeleton count={4} />
      <BookingRowSkeletonList count={3} />
    </div>
  );
}

function BookingsPage() {
  const { bookings } = Route.useLoaderData();
  const today = todayInTirana();
  const nowMin = nowMinutesInTirana();

  const upcoming = bookings
    .filter(
      (b) =>
        b.status === "confirmed" &&
        !isSlotPast(b.booking_date, formatSlot(b.booking_time), today, nowMin),
    )
    .sort(
      (a, b) =>
        a.booking_date.localeCompare(b.booking_date) ||
        a.booking_time.localeCompare(b.booking_time),
    );
  const upcomingIds = new Set(upcoming.map((b) => b.id));
  const past = bookings.filter((b) => !upcomingIds.has(b.id));
  const completed = bookings.filter((b) => b.status === "completed").length;
  const cancelled = bookings.filter((b) => b.status === "cancelled").length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="My bookings"
        subtitle="Your reservations follow you across all devices."
      />

      <div className="flex flex-wrap gap-4">
        <StatChip label="Total" value={String(bookings.length)} />
        <StatChip label="Upcoming" value={String(upcoming.length)} accent />
        <StatChip label="Completed" value={String(completed)} />
        <StatChip label="Cancelled" value={String(cancelled)} />
      </div>

      {bookings.length === 0 ? (
        <EmptyState
          title="No bookings yet"
          body="Pick a venue and choose a time to make your first reservation."
          action={
            <Link to="/venues" className={primaryPillClass()}>
              Browse venues
            </Link>
          }
        />
      ) : (
        <>
          <Section title="Upcoming" bookings={upcoming} editable />
          <Section title="Past & cancelled" bookings={past} />
        </>
      )}
    </div>
  );
}

function Section({
  title,
  bookings,
  editable = false,
}: {
  title: string;
  bookings: Booking[];
  editable?: boolean;
}) {
  if (bookings.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h2>
      <ul className="flex flex-col gap-3">
        {bookings.map((booking) => (
          <BookingRow key={booking.id} booking={booking} editable={editable} />
        ))}
      </ul>
    </section>
  );
}

function BookingRow({
  booking,
  editable,
}: {
  booking: Booking;
  editable: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState(booking.booking_date);
  const [newTime, setNewTime] = useState<string | null>(
    formatSlot(booking.booking_time),
  );
  const [error, setError] = useState<string | null>(null);

  const venueName = booking.venues?.name ?? booking.venue_slug;
  const imageUrl = booking.venues?.image_url ?? null;
  const hours = {
    opens_at: booking.venues?.opens_at ?? "18:00",
    closes_at: booking.venues?.closes_at ?? "23:00",
    slot_minutes: booking.venues?.slot_minutes ?? 60,
  };
  const slots = venueSlots(hours);

  async function handleCancel() {
    setBusy(true);
    setError(null);
    try {
      const result = await cancelBooking({ data: { id: booking.id } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Booking cancelled.");
      await router.invalidate();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReschedule(e: React.FormEvent) {
    e.preventDefault();
    if (!newTime) return;
    setBusy(true);
    setError(null);
    try {
      const result = await rescheduleBooking({
        data: { id: booking.id, bookingDate: newDate, bookingTime: newTime },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(
        `Moved to ${formatBookingDate(newDate)} at ${newTime}. Your code stays ${booking.confirmation_code}.`,
      );
      setRescheduling(false);
      await router.invalidate();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  function addToCalendar() {
    downloadIcs(
      `newpop-${booking.venue_slug}-${booking.booking_date}`,
      buildIcs({
        uid: booking.id,
        title: `Table at ${venueName}`,
        description: `Booking ${booking.confirmation_code} for ${booking.party_size}${booking.notes ? ` — ${booking.notes}` : ""}`,
        location: [
          booking.venue_locations?.name,
          booking.venues?.address ?? venueName,
        ]
          .filter(Boolean)
          .join(", "),
        date: booking.booking_date,
        time: booking.booking_time,
        durationMinutes: hours.slot_minutes,
      }),
    );
  }

  const unchanged =
    newDate === booking.booking_date &&
    newTime === formatSlot(booking.booking_time);

  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-4 p-5">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div className="h-14 w-14 shrink-0 rounded-xl bg-muted" />
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/venues/$slug"
              params={{ slug: booking.venue_slug }}
              className="truncate text-sm font-semibold text-foreground hover:underline"
            >
              {venueName}
            </Link>
            <span
              className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-muted-foreground"
              title="Confirmation code"
            >
              {booking.confirmation_code}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            <time
              dateTime={`${booking.booking_date}T${booking.booking_time}`}
              className="tabular-nums"
            >
              {formatBookingDate(booking.booking_date)} at{" "}
              {formatSlot(booking.booking_time)}
            </time>
            {" · "}
            {booking.party_size}{" "}
            {booking.party_size === 1 ? "person" : "people"}
            {booking.venue_locations?.name
              ? ` · ${booking.venue_locations.name}`
              : ""}
          </p>
          {booking.notes ? (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Notes:</span> {booking.notes}
            </p>
          ) : null}
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <StatusPill status={booking.status} />

        <div className="flex flex-wrap gap-2">
          {booking.status === "confirmed" ? (
            <button
              type="button"
              onClick={addToCalendar}
              className={pillClass("gap-1.5 text-xs")}
              aria-label={`Add ${venueName} booking to calendar`}
            >
              <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
              Calendar
            </button>
          ) : null}
          {editable && booking.status === "confirmed" && !rescheduling ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setRescheduling(true);
                  setError(null);
                }}
                disabled={busy}
                className={pillClass("text-xs")}
              >
                Reschedule
              </button>
              <ConfirmButton
                title="Cancel this booking?"
                description={`Your table at ${venueName} on ${formatBookingDate(booking.booking_date)} at ${formatSlot(booking.booking_time)} will be released. This cannot be undone.`}
                confirmLabel="Cancel booking"
                cancelLabel="Keep booking"
                onConfirm={handleCancel}
                disabled={busy}
                className={pillClass("text-xs", { danger: true })}
              >
                {busy ? "Cancelling…" : "Cancel"}
              </ConfirmButton>
            </>
          ) : null}
          {booking.status === "completed" ? (
            <Link
              to="/venues/$slug"
              params={{ slug: booking.venue_slug }}
              className={pillClass("text-xs")}
            >
              Leave a review
            </Link>
          ) : null}
        </div>
      </div>

      {rescheduling ? (
        <form
          onSubmit={handleReschedule}
          className="border-t border-border bg-muted/30 px-5 py-4"
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Move this booking
          </p>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`date-${booking.id}`}
                className="text-xs font-medium text-muted-foreground"
              >
                New date
              </label>
              <input
                id={`date-${booking.id}`}
                type="date"
                required
                min={todayInTirana()}
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="h-10 w-fit rounded-xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                New time
              </span>
              <SlotPicker
                venueSlug={booking.venue_slug}
                date={newDate}
                slots={slots}
                selected={newTime}
                capacity={Number.MAX_SAFE_INTEGER}
                onSelect={setNewTime}
                excludeBookingId={booking.id}
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || unchanged || !newTime}
              className={primaryPillClass("text-xs")}
            >
              {busy ? "Moving…" : "Confirm new time"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRescheduling(false);
                setNewDate(booking.booking_date);
                setNewTime(formatSlot(booking.booking_time));
                setError(null);
              }}
              className={pillClass("text-xs")}
            >
              Never mind
            </button>
          </div>
        </form>
      ) : null}
    </li>
  );
}

function StatusPill({ status }: { status: Booking["status"] }) {
  const styles: Record<Booking["status"], string> = {
    confirmed: "bg-accent text-accent-foreground",
    completed: "bg-muted text-muted-foreground",
    cancelled: "bg-destructive/10 text-destructive",
  };
  return (
    <span
      className={`rounded-full px-3 py-0.5 text-[11px] font-semibold capitalize ${styles[status]}`}
    >
      {status}
    </span>
  );
}
