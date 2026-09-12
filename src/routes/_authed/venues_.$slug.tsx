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
import {
  checkInToVenue,
  checkOutFromVenue,
  fetchVenueSocialFeed,
  type PresenceEntry,
} from "../../lib/social";
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
  pendingComponent: VenueDetailSkeleton,
  errorComponent: ({ error }) => {
    const message =
      error instanceof Error ? error.message : "Something went wrong.";
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-20 text-center">
        <h1 className="text-base font-semibold text-foreground">
          Could not load venue
        </h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">{message}</p>
        <Link
          to="/venues"
          className="mt-5 inline-flex items-center rounded-full border border-border bg-card px-4 py-2 text-sm font-medium shadow-sm hover:border-foreground/20"
        >
          Back to venues
        </Link>
      </div>
    );
  },
  component: VenueDetailPage,
});

/* ── Skeleton shown while the loader is in-flight ─────────────────── */
function VenueDetailSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="h-9 w-32 animate-pulse rounded-full bg-muted" />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-5">
          <div className="aspect-[16/9] w-full animate-pulse rounded-2xl bg-muted" />
          <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
          <div className="flex gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-12 w-24 animate-pulse rounded-xl bg-muted"
              />
            ))}
          </div>
          <div className="space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="h-72 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}

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
  const [activeTab, setActiveTab] = useState<"overview" | "reviews" | "chat" | "going">(
    "overview",
  );

  if (!detail) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-20 text-center">
        <svg
          className="mb-5 h-16 w-16 text-muted-foreground/30"
          viewBox="0 0 80 80"
          fill="none"
          aria-hidden
        >
          <circle
            cx="40"
            cy="40"
            r="36"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray="6 4"
          />
          <path
            d="M26 40h28M40 26v28"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
        <h1 className="text-base font-semibold text-foreground">
          Venue not found
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have been removed, or the link is wrong.
        </p>
        <Link
          to="/venues"
          className="mt-5 inline-flex items-center rounded-full border border-border bg-card px-4 py-2 text-sm font-medium shadow-sm hover:border-foreground/20"
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

          {/* Stats strip */}
          <div className="flex flex-wrap gap-3">
            <StatChip
              label="Age range"
              value={`${venue.min_age}–${venue.max_age}`}
            />
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

          {/* ── Tab pills ── */}
          <div className="flex gap-2 border-b border-border pb-1">
            {(["overview", "reviews", "chat", "going"] as const).map((tab) => (
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
                  : tab === "going"
                    ? "Who's going"
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
                  {reviews.map((review) => {
                    /* Author display name from the joined public_profiles row */
                    const authorName =
                      (
                        review as unknown as {
                          public_profiles?: { display_name: string | null };
                        }
                      ).public_profiles?.display_name ?? "Member";

                    return (
                      <li
                        key={review.id}
                        className="rounded-2xl border border-border bg-card p-4 shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {/* Author avatar initial */}
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                              {(authorName[0] ?? "M").toUpperCase()}
                            </div>
                            <span className="text-xs font-medium text-foreground">
                              {authorName}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <StarRating rating={review.rating} />
                            <span className="text-xs text-muted-foreground">
                              {review.rating}/5
                            </span>
                          </div>
                        </div>
                        {review.comment ? (
                          <p className="mt-2 text-sm text-muted-foreground">
                            {review.comment}
                          </p>
                        ) : null}
                        <time
                          dateTime={review.created_at}
                          className="mt-1.5 block text-[11px] text-muted-foreground/60"
                        >
                          {new Date(review.created_at).toLocaleDateString()}
                        </time>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {activeTab === "chat" && <VenueChat venueSlug={venue.slug} />}

          {activeTab === "going" && (
            <SocialFeedPanel venueSlug={venue.slug} date={date} />
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

            {/* Location — pill picker instead of <select> */}
            {locations.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium">Location</Label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setLocationId("")}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                      locationId === ""
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground"
                    }`}
                  >
                    Any
                  </button>
                  {locations.map((loc) => (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => setLocationId(loc.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                        locationId === loc.id
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground"
                      }`}
                    >
                      {loc.name}
                    </button>
                  ))}
                </div>
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
  }, [venueSlug, date]);

  const slotsLeft = new Map(
    availability.map((r) => [r.booking_time.slice(0, 5), r.seats_left]),
  );

  return (
    <div className="flex flex-wrap gap-2">
      {TIME_SLOTS.map((slot) => {
        const left = slotsLeft.has(slot)
          ? (slotsLeft.get(slot) ?? 0)
          : capacity;
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
              <span className="mt-0.5 text-[9px] text-muted-foreground/50">
                …
              </span>
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

/* ── Social feed panel — who from your connections is going ─────── */
function SocialFeedPanel({
  venueSlug,
  date,
}: {
  venueSlug: string;
  date: string;
}) {
  const router = useRouter();
  const [feed, setFeed] = useState<PresenceEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [note, setNote] = useState("");
  const [myEntry, setMyEntry] = useState<PresenceEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchVenueSocialFeed({ data: { venueSlug, date } })
      .then((rows) => {
        if (!cancelled) setFeed(rows);
      })
      .catch(() => {
        if (!cancelled) setFeed([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [venueSlug, date]);

  async function handleCheckIn(e: React.FormEvent) {
    e.preventDefault();
    setCheckingIn(true);
    try {
      const result = await checkInToVenue({
        data: { venueSlug, date, note: note.trim() || undefined },
      });
      if (result.ok) {
        setMyEntry({ user_id: "me", display_name: "You", avatar_url: null, note: note.trim() || null, checkin_date: date });
        setNote("");
        // Refresh feed
        const rows = await fetchVenueSocialFeed({ data: { venueSlug, date } });
        setFeed(rows);
        await router.invalidate();
      }
    } finally {
      setCheckingIn(false);
    }
  }

  async function handleCheckOut() {
    setCheckingIn(true);
    try {
      await checkOutFromVenue({ data: { venueSlug, date } });
      setMyEntry(null);
      const rows = await fetchVenueSocialFeed({ data: { venueSlug, date } });
      setFeed(rows);
      await router.invalidate();
    } finally {
      setCheckingIn(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Announce you're going */}
      {myEntry ? (
        <div className="flex items-center justify-between rounded-2xl border border-accent bg-accent/10 px-5 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              You're going on {date}
            </p>
            {myEntry.note && (
              <p className="text-xs text-muted-foreground">{myEntry.note}</p>
            )}
          </div>
          <button
            onClick={() => void handleCheckOut()}
            disabled={checkingIn}
            className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleCheckIn}
          className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm"
        >
          <div className="flex flex-1 flex-col gap-1 min-w-[180px]">
            <label className="text-xs font-medium text-muted-foreground">
              Tell your connections you're going
            </label>
            <input
              type="text"
              maxLength={280}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note, e.g. arriving at 21:00"
              className="h-9 rounded-xl border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            type="submit"
            disabled={checkingIn}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {checkingIn ? "Saving…" : "I'm going"}
          </button>
        </form>
      )}

      {/* Feed */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Connections going on {date}
        </h3>
        {loading ? (
          <div className="flex flex-col gap-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : !feed || feed.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              None of your connections have announced they're going here on this date.
            </p>
            <Link
              to="/people"
              className="mt-3 inline-flex rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-all hover:border-foreground/20 hover:text-foreground"
            >
              Find connections →
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {feed.map((entry) => (
              <li
                key={entry.user_id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                  {((entry.display_name ?? "M")[0] ?? "M").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {entry.display_name ?? "Member"}
                  </p>
                  {entry.note && (
                    <p className="text-xs text-muted-foreground">{entry.note}</p>
                  )}
                </div>
                <Link
                  to="/messages/$userId"
                  params={{ userId: entry.user_id }}
                  className="shrink-0 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-all hover:border-foreground/20 hover:text-foreground"
                >
                  Message
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ── Build timeline from reviews ─────────────────────────────────── */
function buildTimeline(
  reviews: Array<{
    id: string;
    rating: number;
    comment?: string | null;
    created_at?: string;
  }>,
): TimelineEvent[] {
  if (reviews.length === 0) return [];

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
