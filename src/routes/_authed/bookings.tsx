import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { BookingRowSkeletonList, StatChipSkeleton } from "../../components/Skeletons";
import { cancelBooking, fetchMyBookings, type Booking } from "../../lib/bookings";
import { todayInTirana } from "../../lib/utils";
import { EmptyState } from "./venues";

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
        <StatChip label="Completed" value={String(past.filter(b => b.status === "completed").length)} />
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
          <Section title="Upcoming" bookings={upcoming} cancellable />
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
}: {
  title: string;
  bookings: Booking[];
  cancellable?: boolean;
}) {
  if (bookings.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h2>
      <ul className="flex flex-col gap-3">
        {bookings.map((booking) => (
          <BookingRow key={booking.id} booking={booking} cancellable={cancellable} />
        ))}
      </ul>
    </section>
  );
}

function BookingRow({
  booking,
  cancellable,
}: {
  booking: Booking;
  cancellable: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <li className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      {/* Accent strip on left edge for upcoming */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {booking.venues?.name ?? booking.venue_slug}
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
      </div>

      <StatusPill status={booking.status} />

      {cancellable && booking.status === "confirmed" ? (
        <button
          onClick={handleCancel}
          disabled={busy}
          className="rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-all hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
        >
          {busy ? "Cancelling…" : "Cancel"}
        </button>
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
      <span className="text-xl font-semibold leading-none text-foreground">{value}</span>
    </div>
  );
}
