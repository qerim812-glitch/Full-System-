import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../../components/ui/button";
import {
  cancelBooking,
  fetchMyBookings,
  type Booking,
} from "../../lib/bookings";
import { todayInTirana } from "../../lib/utils";
import { EmptyState } from "./venues";

export const Route = createFileRoute("/_authed/bookings")({
  loader: async () => ({ bookings: await fetchMyBookings() }),
  component: BookingsPage,
  errorComponent: () => (
    <EmptyState
      title="Could not load your bookings"
      body="If the database migrations have not been applied yet, run supabase/migrations in order and refresh."
    />
  ),
});

function BookingsPage() {
  const { bookings } = Route.useLoaderData();

  const upcoming = bookings.filter(
    (b) => b.status === "confirmed" && b.booking_date >= todayInTirana(),
  );
  const past = bookings.filter((b) => !upcoming.includes(b));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          My bookings
        </h1>
        <p className="text-sm text-muted-foreground">
          Your reservations are saved to your account, so they follow you across
          devices.
        </p>
      </div>

      {bookings.length === 0 ? (
        <EmptyState
          title="No bookings yet"
          body="Pick a venue and choose a time to make your first reservation."
        />
      ) : (
        <>
          <Section title="Upcoming" bookings={upcoming} cancellable />
          <Section title="Past and cancelled" bookings={past} />
        </>
      )}

      <div>
        <Button asChild variant="outline">
          <Link to="/venues">Browse venues</Link>
        </Button>
      </div>
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
          <BookingRow
            key={booking.id}
            booking={booking}
            cancellable={cancellable}
          />
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
    <li className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {booking.venues?.name ?? booking.venue_slug}
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="tabular-nums">
            {booking.booking_date} at {booking.booking_time.slice(0, 5)}
          </span>
          {" · "}
          {booking.party_size} {booking.party_size === 1 ? "person" : "people"}
          {booking.venue_locations?.name
            ? ` · ${booking.venue_locations.name}`
            : ""}
        </p>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>

      <StatusPill status={booking.status} />

      {cancellable && booking.status === "confirmed" ? (
        <Button
          variant="outline"
          size="sm"
          onClick={handleCancel}
          disabled={busy}
        >
          {busy ? "Cancelling…" : "Cancel"}
        </Button>
      ) : null}
    </li>
  );
}

function StatusPill({ status }: { status: Booking["status"] }) {
  const styles: Record<Booking["status"], string> = {
    confirmed: "border-border text-foreground",
    completed: "border-border text-muted-foreground",
    cancelled: "border-destructive/40 text-destructive",
  };
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize ${styles[status]}`}
    >
      {status}
    </span>
  );
}
