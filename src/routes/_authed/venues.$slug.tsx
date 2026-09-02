import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { createBooking } from "../../lib/bookings";
import { fetchVenue } from "../../lib/venues";

const TIME_SLOTS = [
  "18:00",
  "19:00",
  "20:00",
  "21:00",
  "22:00",
  "23:00",
] as const;

export const Route = createFileRoute("/_authed/venues/$slug")({
  loader: async ({ params }) => fetchVenue({ data: { slug: params.slug } }),
  component: VenueDetailPage,
});

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function VenueDetailPage() {
  const data = Route.useLoaderData();
  const router = useRouter();

  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState<string>(TIME_SLOTS[1]);
  const [partySize, setPartySize] = useState(2);
  const [locationId, setLocationId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!data) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
        <h1 className="text-base font-semibold text-foreground">
          Venue not found
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have been removed, or the link is wrong.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/venues">Back to venues</Link>
        </Button>
      </div>
    );
  }

  const { venue, locations, reviews, averageRating } = data;

  async function handleBook(event: React.FormEvent) {
    event.preventDefault();
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
        },
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(`Table booked at ${venue.name} on ${date} at ${time}.`);
      await router.invalidate();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          to="/venues"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← All venues
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-4">
          {venue.image_url ? (
            <img
              src={venue.image_url}
              alt=""
              className="aspect-[16/9] w-full rounded-lg border border-border object-cover"
            />
          ) : null}

          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {venue.name}
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {venue.description}
            </p>
          </div>

          <dl className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-card p-4">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Age range
              </dt>
              <dd className="mt-1 text-sm font-medium tabular-nums text-foreground">
                {venue.min_age}–{venue.max_age}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Capacity
              </dt>
              <dd className="mt-1 text-sm font-medium tabular-nums text-foreground">
                {venue.capacity}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Rating
              </dt>
              <dd className="mt-1 text-sm font-medium tabular-nums text-foreground">
                {averageRating
                  ? `${averageRating.toFixed(1)} / 5`
                  : "No reviews"}
              </dd>
            </div>
          </dl>

          {venue.location_url ? (
            <a
              href={venue.location_url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-sm text-foreground underline underline-offset-4"
            >
              Open in Google Maps
            </a>
          ) : null}

          <section className="flex flex-col gap-3 pt-2">
            <h2 className="text-base font-semibold text-foreground">
              Reviews {reviews.length > 0 ? `(${reviews.length})` : ""}
            </h2>
            {reviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No reviews yet. You can leave one after you have visited.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {reviews.map((review) => (
                  <li
                    key={review.id}
                    className="rounded-md border border-border bg-card p-3"
                  >
                    <p className="text-sm font-medium tabular-nums text-foreground">
                      {review.rating} / 5
                    </p>
                    {review.comment ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {review.comment}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Booking form */}
        <form
          onSubmit={handleBook}
          className="flex h-fit flex-col gap-4 rounded-lg border border-border bg-card p-5"
        >
          <h2 className="text-base font-semibold text-foreground">
            Book a table
          </h2>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {success ? (
            <Alert>
              <AlertDescription>
                {success}{" "}
                <Link
                  to="/bookings"
                  className="font-medium underline underline-offset-4"
                >
                  View bookings
                </Link>
              </AlertDescription>
            </Alert>
          ) : null}

          {locations.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="location">Location</Label>
              <select
                id="location"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="">Any location</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              required
              min={todayIso()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="time">Time</Label>
            <select
              id="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              {TIME_SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="party">People</Label>
            <Input
              id="party"
              type="number"
              min={1}
              max={20}
              required
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value))}
            />
          </div>

          <Button type="submit" disabled={busy} className="mt-1 w-full">
            {busy ? "Booking…" : "Confirm booking"}
          </Button>

          <p className="text-xs text-muted-foreground">
            Age limits and remaining seats are checked when you confirm.
          </p>
        </form>
      </div>
    </div>
  );
}
