import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import {
  BookingRowSkeletonList,
  StatChipSkeleton,
} from "../../components/Skeletons";
import {
  cancelBooking,
  createBooking,
  fetchMyBookings,
  type Booking,
} from "../../lib/bookings";
import { todayInTirana } from "../../lib/utils";
import { EmptyState } from "./venues";

const TIME_SLOTS = ["18:00", "19:00", "20:00", "21:00", "22:00", "23:00"] as const;

export const Route = createFileRoute("/_authed/bookings")({
  loader: async () => ({ bookings: await fetchMyBookings() }),
  pendingComponent: BookingsSkeleton,
  component: BookingsPage,
  errorComponent: () => (
    <EmptyState
      title="Could not load your bookings"
      body="If the database migrations have not been applied yet, run supabase/migrations in order and refresh."
    />
  ),
});

function BookingsSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
      <StatChipSkeleton count={4} />
      <BookingRowSkeletonList count={3} />
    </div>
  );
}

function BookingsPage() {
  const { bookings } = Route.useLoaderData();

  const upcoming = bookings.filter(
    (b) => b.status === "confirmed" && b.booking_date >= todayInTirana(),
  );
  const past = bookings.filter((b) => !upcoming.includes(b));
  const cancelled = bookings.filter((b) => b.status === "cancelled");

  return (
    <div className="flex flex-col gap-8">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          My Bookings
        </h1>
        <p className="text-sm text-muted-foreground">
          Your reservations follow you across all devices.
        </p>
      </div>

      {/* ── Stats strip ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4">
        <StatChip label="Total" value={String(bookings.length)} />
        <StatChip label="Upcoming" value={String(upcoming.length)} accent />
        <StatChip
          label="Completed"
          value={String(past.filter((b) => b.status === "completed").length)}
        />
        <StatChip label="Cancelled" value={String(cancelled.length)} />
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      {bookings.length === 0 ? (
        <EmptyState
          title="No bookings yet"
          body="Pick a venue and choose a time to make your first reservation."
          action={
            <Link
              to="/venues"
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Browse venues
            </Link>
          }
        />
      ) : (
        <>
          <Section title="Upcoming" bookings={upcoming} cancellable reschedulable />
          <Section title="Past & cancelled" bookings={past} />
        </>
      )}
    </div>
  );
}

function Section({
  title,
  bookings,
  cancellable = false,
  reschedulable = false,
}: {
  title: string;
  bookings: Booking[];
  cancellable?: boolean;
  reschedulable?: boolean;
}) {
  if (bookings.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h2>
      <ul className="flex flex-col gap-3">
        {bookings.map((booking) => (
          <BookingRow
            key={booking.id}
            booking={booking}
            cancellable={cancellable}
            reschedulable={reschedulable}
          />
        ))}
      </ul>
    </section>
  );
}

function BookingRow({
  booking,
  cancellable,
  reschedulable,
}: {
  booking: Booking;
  cancellable: boolean;
  reschedulable: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState(booking.booking_date);
  const [newTime, setNewTime] = useState(
    booking.booking_time.slice(0, 5) as (typeof TIME_SLOTS)[number],
  );
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [rescheduleSuccess, setRescheduleSuccess] = useState<string | null>(
    null,
  );

  async function handleCancel() {
    setBusy(true);
    setError(null);
    const result = await cancelBooking({ data: { id: booking.id } });
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    await router.invalidate();
    setBusy(false);
  }

  async function handleReschedule(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setRescheduleError(null);
    setRescheduleSuccess(null);

    // Cancel old booking then create a new one with the same details
    const cancelResult = await cancelBooking({ data: { id: booking.id } });
    if (!cancelResult.ok) {
      setRescheduleError(cancelResult.error);
      setBusy(false);
      return;
    }

    const createResult = await createBooking({
      data: {
        venueSlug: booking.venue_slug,
        bookingDate: newDate,
        bookingTime: newTime,
        partySize: booking.party_size,
        locationId: booking.location_id ?? null,
      },
    });

    if (!createResult.ok) {
      setRescheduleError(createResult.error);
      setBusy(false);
      // Re-invalidate so the original cancelled booking is reflected
      await router.invalidate();
      return;
    }

    setRescheduleSuccess(`Rescheduled to ${newDate} at ${newTime}.`);
    setRescheduling(false);
    await router.invalidate();
    setBusy(false);
  }

  const venueName = booking.venues?.name ?? booking.venue_slug;
  const imageUrl = booking.venues?.image_url ?? null;

  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-4 p-5">
        {/* Venue thumbnail */}
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
          <p className="truncate text-sm font-semibold text-foreground">
            {venueName}
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="tabular-nums">
              {booking.booking_date} at {booking.booking_time.slice(0, 5)}
            </span>
            {" · "}
            {booking.party_size}{" "}
            {booking.party_size === 1 ? "person" : "people"}
            {booking.venue_locations?.name
              ? ` · ${booking.venue_locations.name}`
              : ""}
          </p>
          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : null}
          {rescheduleSuccess ? (
            <p className="text-xs text-green-600 dark:text-green-400">
              {rescheduleSuccess}
            </p>
          ) : null}
        </div>

        <StatusPill status={booking.status} />

        <div className="flex gap-2">
          {reschedulable && booking.status === "confirmed" && !rescheduling && (
            <button
              onClick={() => {
                setRescheduling(true);
                setRescheduleError(null);
              }}
              disabled={busy}
              className="rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-all hover:border-foreground/20 hover:text-foreground disabled:opacity-50"
            >
              Reschedule
            </button>
          )}
          {cancellable && booking.status === "confirmed" && !rescheduling && (
            <button
              onClick={handleCancel}
              disabled={busy}
              className="rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-all hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
            >
              {busy ? "Cancelling…" : "Cancel"}
            </button>
          )}
        </div>
      </div>

      {/* ── Inline reschedule form ─────────────────────────────── */}
      {rescheduling && (
        <form
          onSubmit={handleReschedule}
          className="border-t border-border bg-muted/30 px-5 py-4"
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Reschedule booking
          </p>
          {rescheduleError && (
            <p className="mb-2 text-xs text-destructive">{rescheduleError}</p>
          )}
          <div className="flex flex-wrap items-end gap-3">
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
                className="h-9 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                New time
              </span>
              <div className="flex flex-wrap gap-1.5">
                {TIME_SLOTS.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setNewTime(slot)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                      newTime === slot
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={
                busy ||
                (newDate === booking.booking_date &&
                  newTime === booking.booking_time.slice(0, 5))
              }
              className="rounded-full bg-primary px-5 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Rescheduling…" : "Confirm new time"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRescheduling(false);
                setNewDate(booking.booking_date);
                setNewTime(
                  booking.booking_time.slice(0, 5) as (typeof TIME_SLOTS)[number],
                );
                setRescheduleError(null);
              }}
              className="rounded-full border border-border px-4 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
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

function StatChip({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex min-w-[6rem] flex-col gap-0.5 rounded-2xl px-5 py-3 shadow-sm ${
        accent ? "bg-accent text-accent-foreground" : "border border-border bg-card"
      }`}
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold leading-none text-foreground">
        {value}
      </span>
    </div>
  );
}
