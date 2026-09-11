import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { FavoriteButton } from "../../components/FavoriteButton";
import { ReportDialog } from "../../components/ReportDialog";
import { ReviewForm } from "../../components/ReviewForm";
import {
  TimelineSection,
  type TimelineEvent,
} from "../../components/TimelineSection";
import { VenueChat } from "../../components/VenueChat";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { createBooking } from "../../lib/bookings";
import { fetchMyFavorites } from "../../lib/favorites";
import { canReviewVenue, fetchMyReview } from "../../lib/reviews";
import { todayInTirana } from "../../lib/utils";
import { fetchAvailability, fetchVenue } from "../../lib/venues";

const TIME_SLOTS = [
  "18:00",
  "19:00",
  "20:00",
  "21:00",
  "22:00",
  "23:00",
] as const;

export const Route = createFileRoute("/_authed/venues_/$slug")({
  loader: async ({ params }) => {
    const [detail, favorites, myReview, canReview] = await Promise.all([
      fetchVenue({ data: { slug: params.slug } }),
      fetchMyFavorites(),
      fetchMyReview({ data: { venueSlug: params.slug } }),
      canReviewVenue({ data: { venueSlug: params.slug } }),
    ]);
    return { detail, favorites, myReview, canReview };
  },
  component: VenueDetailPage,
});

function VenueDetailPage() {
  const { detail, favorites, myReview, canReview } = Route.useLoaderData();
  const router = useRouter();

  const [date, setDate] = useState(todayInTirana());
  const [time, setTime] = useState<string>(TIME_SLOTS[1]);
  const [partySize, setPartySize] = useState(2);
  const [locationId, setLocationId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "reviews" | "chat">(
    "overview",
  );

  if (!detail) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
        <h1 className="text-base font-semibold text-foreground">
          Venue not found
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have been removed, or the link is wrong.
        </p>
        <Link
          to="/venues"
          className="mt-4 inline-flex items-center rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:border-foreground/20"
        >
          Back to venues
        </Link>
      </div>
    );
  }

  const { venue, locations, reviews, averageRating } = detail;

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

  /* Build timeline events from reviews (most recent 6, grouped by month) */
  const timelineEvents: TimelineEvent[] = buildTimeline(reviews);

  return (
    <div className="flex flex-col gap-8">

      {/* ── Back crumb ──────────────────────────────────────────────── */}
      <Link
        to="/venues"
        className="flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground shadow-sm transition-all hover:border-foreground/20 hover:text-foreground"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        All venues
      </Link>

      {/* ── Main two-column panel ────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">

        {/* LEFT — venue identity card */}
        <div className="flex flex-col gap-5">

          {/* Hero image */}
          {venue.image_url ? (
            <img
              src={venue.image_url}
              alt=""
              className="aspect-[16/9] w-full rounded-2xl object-cover shadow-sm"
            />
          ) : (
            <div className="aspect-[16/9] w-full rounded-2xl bg-muted shadow-sm" />
          )}

          {/* Name + actions row */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {venue.name}
              </h1>
              {venue.location_url ? (
                <a
                  href={venue.location_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  Open in Maps
                </a>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <FavoriteButton
                venueSlug={venue.slug}
                initialFavorited={favorites.includes(venue.slug)}
              />
              <ReportDialog venueSlug={venue.slug} />
            </div>
          </div>

          {/* Stats strip — mirrors the vital-signs row */}
          <div className="flex flex-wrap gap-3">
            <StatChip label="Age range" value={`${venue.min_age}–${venue.max_age}`} />
            <StatChip label="Capacity" value={String(venue.capacity)} />
            <StatChip
              label="Rating"
              value={averageRating ? `${averageRating.toFixed(1)} / 5` : "—"}
              accent={!!averageRating}
            />
            <StatChip label="Reviews" value={String(reviews.length)} />
          </div>

          {/* Description */}
          <p className="text-sm leading-relaxed text-muted-foreground">
            {venue.description}
          </p>

          {/* ── Tab pills — Overview / Reviews / Chat ── */}
          <div className="flex gap-2 border-b border-border pb-1">
            {(["overview", "reviews", "chat"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-all ${
                  activeTab === tab
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "reviews"
                  ? `Reviews${reviews.length > 0 ? ` (${reviews.length})` : ""}`
                  : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* ── Tab panels ── */}
          {activeTab === "overview" && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                {reviews.length === 0
                  ? "No visits yet. Book a table below to be the first."
                  : `${reviews.length} visit${reviews.length > 1 ? "s" : ""} recorded.`}
              </p>

              {/* Horizontal booking timeline */}
              {timelineEvents.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                  <h3 className="mb-4 text-sm font-semibold text-foreground">
                    Visit history
                  </h3>
                  <TimelineSection events={timelineEvents} />
                </div>
              )}
            </div>
          )}

          {activeTab === "reviews" && (
            <div className="flex flex-col gap-4">
              {canReview || myReview ? (
                <ReviewForm venueSlug={venue.slug} existing={myReview} />
              ) : (
                <div className="rounded-2xl border border-dashed border-border px-5 py-4 text-sm text-muted-foreground">
                  You can leave a review after visiting. Book a table — your
                  review unlocks once the booking date passes.
                </div>
              )}

              {reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No reviews yet. Be the first after your visit.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {reviews.map((review) => (
                    <li
                      key={review.id}
                      className="rounded-2xl border border-border bg-card p-4 shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <StarRating rating={review.rating} />
                        <span className="text-xs text-muted-foreground">
                          {review.rating} / 5
                        </span>
                      </div>
                      {review.comment ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {review.comment}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {activeTab === "chat" && (
            <VenueChat venueSlug={venue.slug} />
          )}
        </div>

        {/* RIGHT — floating booking card */}
        <div className="lg:sticky lg:top-24 h-fit">
          <form
            onSubmit={handleBook}
            className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="location" className="text-xs font-medium">
                  Location
                </Label>
                <select
                  id="location"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="h-9 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="date" className="text-xs font-medium">
                Date
              </Label>
              <Input
                id="date"
                type="date"
                required
                min={todayInTirana()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-xl"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">Time</Label>
              <SlotPicker
                venueSlug={venue.slug}
                date={date}
                selected={time}
                capacity={venue.capacity}
                onSelect={setTime}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="party" className="text-xs font-medium">
                People
              </Label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPartySize((n) => Math.max(1, n - 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground hover:border-foreground/20"
                >
                  −
                </button>
                <span className="w-6 text-center text-sm font-semibold tabular-nums text-foreground">
                  {partySize}
                </span>
                <button
                  type="button"
                  onClick={() => setPartySize((n) => Math.min(20, n + 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground hover:border-foreground/20"
                >
                  +
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="mt-1 w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Booking…" : "Confirm booking"}
            </button>

            <p className="text-center text-[11px] text-muted-foreground">
              Age limits and remaining seats are checked when you confirm.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ── Stat chip ───────────────────────────────────────────────────── */
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
      className={`flex min-w-[6rem] flex-col gap-0.5 rounded-xl px-4 py-2.5 shadow-sm ${
        accent
          ? "bg-accent text-accent-foreground"
          : "border border-border bg-card"
      }`}
    >
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-lg font-semibold leading-none text-foreground">
        {value}
      </span>
    </div>
  );
}

/* ── Slot picker with live availability ─────────────────────────── */
function SlotPicker({
  venueSlug,
  date,
  selected,
  capacity,
  onSelect,
}: {
  venueSlug: string;
  date: string;
  selected: string;
  capacity: number;
  onSelect: (slot: string) => void;
}) {
  const [availability, setAvailability] = useState<
    Array<{ booking_time: string; seats_taken: number; seats_left: number }>
  >([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    setLoading(true);
    fetchAvailability({ data: { slug: venueSlug, date } })
      .then((rows) => { if (!cancelled) setAvailability(rows); })
      .catch(() => { if (!cancelled) setAvailability([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [venueSlug, date]);

  // Build a map: time → seats_left (missing time = fully available)
  const slotsLeft = new Map(
    availability.map((r) => [r.booking_time.slice(0, 5), r.seats_left]),
  );

  return (
    <div className="flex flex-wrap gap-2">
      {TIME_SLOTS.map((slot) => {
        const left = slotsLeft.has(slot) ? (slotsLeft.get(slot) ?? 0) : capacity;
        const full = left <= 0;
        const low = !full && left <= Math.ceil(capacity * 0.2);

        return (
          <button
            key={slot}
            type="button"
            disabled={full}
            onClick={() => !full && onSelect(slot)}
            className={`relative flex flex-col items-center rounded-2xl px-3 py-2 text-xs font-medium transition-all ${
              full
                ? "cursor-not-allowed border border-border bg-muted/50 text-muted-foreground/40 line-through"
                : selected === slot
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground"
            }`}
          >
            <span>{slot}</span>
            {!full && !loading && (
              <span
                className={`mt-0.5 text-[9px] font-semibold ${
                  selected === slot
                    ? "text-primary-foreground/70"
                    : low
                      ? "text-destructive"
                      : "text-muted-foreground"
                }`}
              >
                {left} left
              </span>
            )}
            {loading && (
              <span className="mt-0.5 text-[9px] text-muted-foreground/50">…</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Star rating display ─────────────────────────────────────────── */
function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          className={`h-4 w-4 ${
            i < rating ? "text-accent-foreground" : "text-muted-foreground/40"
          }`}
          viewBox="0 0 24 24"
          fill={i < rating ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

/* ── Build timeline from reviews ─────────────────────────────────── */
function buildTimeline(
  reviews: Array<{ id: string; rating: number; comment?: string | null; created_at?: string }>,
): TimelineEvent[] {
  if (reviews.length === 0) return [];

  // Group by month (last 6 reviews max)
  const recent = reviews.slice(0, 6);
  const byMonth = new Map<string, typeof recent>();

  for (const r of recent) {
    const dateStr = r.created_at ? new Date(r.created_at) : new Date();
    const key = dateStr.toLocaleString("default", {
      month: "short",
      year: "2-digit",
    });
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(r);
  }

  return Array.from(byMonth.entries()).map(([month, rs], i) => ({
    id: `month-${i}`,
    month,
    subtitle: `${rs.length} visit${rs.length > 1 ? "s" : ""}`,
    cards: rs.map((r) => ({
      id: r.id,
      title: `${r.rating}/5 — ${r.rating >= 4 ? "Great" : r.rating >= 3 ? "Good" : "OK"}`,
      ...(r.comment ? { body: r.comment } : {}),
      badge: `★ ${r.rating}`,
      accent: r.rating >= 4,
    })),
  }));
}
