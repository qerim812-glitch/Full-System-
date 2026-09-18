import { createFileRoute } from "@tanstack/react-router";
import { Clock, MapPin, Phone } from "lucide-react";
import { useId, useState } from "react";

import { FavoriteButton } from "../../components/FavoriteButton";
import {
  BackLink,
  RouteError,
  pillClass,
  primaryPillClass,
} from "../../components/PageChrome";
import { PillTabs, tabPanelProps } from "../../components/PillTabs";
import { ReportDialog } from "../../components/ReportDialog";
import { ReviewForm } from "../../components/ReviewForm";
import { StarRating } from "../../components/StarRating";
import { StatChip } from "../../components/StatChip";
import { VenueChat } from "../../components/VenueChat";
import { BookingForm } from "../../components/venue/BookingForm";
import { ReviewList } from "../../components/venue/ReviewList";
import { SocialFeedPanel } from "../../components/venue/SocialFeedPanel";
import { fetchMyFavorites } from "../../lib/favorites";
import { canReviewVenue, fetchMyReview } from "../../lib/reviews";
import { pageHead } from "../../lib/seo";
import { formatHours } from "../../lib/slots";
import { fetchMyCheckin } from "../../lib/social";
import { todayInTirana } from "../../lib/utils";
import { categoryLabel, priceBandLabel } from "../../lib/venue-filters";
import { fetchVenue } from "../../lib/venues";

type Tab = "overview" | "reviews" | "chat" | "going";

export const Route = createFileRoute("/_authed/venues_/$slug")({
  loader: async ({ params }) => {
    const today = todayInTirana();
    const [detail, favorites, myReview, canReview, myCheckin] =
      await Promise.all([
        fetchVenue({ data: { slug: params.slug } }),
        fetchMyFavorites(),
        fetchMyReview({ data: { venueSlug: params.slug } }),
        canReviewVenue({ data: { venueSlug: params.slug } }),
        fetchMyCheckin({ data: { venueSlug: params.slug, date: today } }),
      ]);
    return { detail, favorites, myReview, canReview, myCheckin, today };
  },
  head: ({ loaderData }) => {
    const venue = loaderData?.detail?.venue;
    return venue
      ? pageHead(venue.name, venue.description, { image: venue.image_url })
      : pageHead("Venue not found");
  },
  pendingComponent: VenueDetailSkeleton,
  errorComponent: ({ error }) => (
    <RouteError
      title="Could not load venue"
      body={error instanceof Error ? error.message : "Something went wrong."}
      backTo="/venues"
      backLabel="Back to venues"
    />
  ),
  component: VenueDetailPage,
});

function VenueDetailSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy>
      <div className="h-9 w-32 animate-pulse rounded-full bg-muted" />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-5">
          <div className="aspect-[16/9] w-full animate-pulse rounded-2xl bg-muted" />
          <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
          <div className="flex flex-wrap gap-3">
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
  const { detail, favorites, myReview, canReview, myCheckin, today } =
    Route.useLoaderData();
  const [date, setDate] = useState(today);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const tabsId = useId();

  if (!detail) {
    return (
      <RouteError
        title="Venue not found"
        body="It may have been removed, or the link is wrong."
        backTo="/venues"
        backLabel="Back to venues"
      />
    );
  }

  const { venue, locations, reviews, reviewCount, averageRating } = detail;

  const tabs = [
    { id: "overview" as const, label: "Overview" },
    { id: "reviews" as const, label: "Reviews", badge: reviewCount },
    { id: "chat" as const, label: "Chat" },
    { id: "going" as const, label: "Who's going" },
  ];

  return (
    <div className="flex flex-col gap-8 pb-20 lg:pb-0">
      <BackLink to="/venues">All venues</BackLink>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-5">
          {venue.image_url ? (
            <img
              src={venue.image_url}
              alt={`${venue.name} interior`}
              className="aspect-[16/9] w-full rounded-2xl object-cover shadow-sm"
            />
          ) : (
            <div className="aspect-[16/9] w-full rounded-2xl bg-muted shadow-sm" />
          )}

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  {venue.name}
                </h1>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {categoryLabel(venue.category)} ·{" "}
                  {priceBandLabel(venue.price_band)}
                </span>
              </div>
              <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  <dt className="sr-only">Opening hours</dt>
                  <dd>{formatHours(venue)}</dd>
                </div>
                {venue.address || venue.location_url ? (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    <dt className="sr-only">Address</dt>
                    <dd>
                      {venue.location_url ? (
                        <a
                          href={venue.location_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="hover:text-foreground hover:underline"
                        >
                          {venue.address ?? "Open in Maps"}
                        </a>
                      ) : (
                        venue.address
                      )}
                    </dd>
                  </div>
                ) : null}
                {venue.phone ? (
                  <div className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" aria-hidden />
                    <dt className="sr-only">Phone</dt>
                    <dd>
                      <a
                        href={`tel:${venue.phone}`}
                        className="hover:text-foreground hover:underline"
                      >
                        {venue.phone}
                      </a>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <FavoriteButton
                venueSlug={venue.slug}
                initialFavorited={favorites.includes(venue.slug)}
              />
              <ReportDialog venueSlug={venue.slug} />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <StatChip
              size="sm"
              label="Rating"
              value={averageRating ? `${averageRating.toFixed(1)} / 5` : "—"}
              accent={!!averageRating}
            />
            <StatChip size="sm" label="Reviews" value={String(reviewCount)} />
            <StatChip
              size="sm"
              label="Capacity"
              value={`${venue.capacity} seats`}
            />
            <StatChip
              size="sm"
              label="Age range"
              value={`${venue.min_age}–${venue.max_age}`}
            />
          </div>

          <PillTabs
            tabs={tabs}
            value={activeTab}
            onChange={setActiveTab}
            label="Venue sections"
          />

          {activeTab === "overview" ? (
            <div
              {...tabPanelProps(tabsId, "overview")}
              className="flex flex-col gap-5"
            >
              <p className="text-sm leading-relaxed text-muted-foreground">
                {venue.description}
              </p>

              {averageRating !== null ? (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
                  <span className="text-3xl font-semibold text-foreground">
                    {averageRating.toFixed(1)}
                  </span>
                  <div>
                    <StarRating rating={averageRating} size="md" />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Based on {reviewCount} review
                      {reviewCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("reviews")}
                    className={pillClass("ml-auto text-xs")}
                  >
                    Read reviews
                  </button>
                </div>
              ) : null}

              {locations.length > 0 ? (
                <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">
                    Branches ({locations.length})
                  </h3>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {locations.map((loc) => (
                      <li
                        key={loc.id}
                        className="flex items-start gap-2 rounded-xl bg-muted/50 px-3 py-2 text-sm"
                      >
                        <MapPin
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">
                            {loc.name}
                          </p>
                          {loc.address ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {loc.address}
                            </p>
                          ) : null}
                          {loc.capacity ? (
                            <p className="text-xs text-muted-foreground">
                              {loc.capacity} seats
                            </p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : null}

          {activeTab === "reviews" ? (
            <div
              {...tabPanelProps(tabsId, "reviews")}
              className="flex flex-col gap-4"
            >
              {canReview || myReview ? (
                <ReviewForm venueSlug={venue.slug} existing={myReview} />
              ) : (
                <div className="rounded-2xl border border-dashed border-border px-5 py-4 text-sm text-muted-foreground">
                  You can leave a review after visiting. Book a table — your
                  review unlocks once your booking time passes.
                </div>
              )}
              <ReviewList
                reviews={reviews}
                venueSlug={venue.slug}
                myReviewId={myReview?.id}
              />
              {reviewCount > reviews.length ? (
                <p className="text-xs text-muted-foreground">
                  Showing the {reviews.length} most recent of {reviewCount}{" "}
                  reviews.
                </p>
              ) : null}
            </div>
          ) : null}

          {activeTab === "chat" ? (
            <div {...tabPanelProps(tabsId, "chat")}>
              <VenueChat venueSlug={venue.slug} />
            </div>
          ) : null}

          {activeTab === "going" ? (
            <div {...tabPanelProps(tabsId, "going")}>
              <SocialFeedPanel
                venueSlug={venue.slug}
                date={date}
                myCheckin={date === today ? myCheckin : null}
              />
            </div>
          ) : null}
        </div>

        <div className="h-fit lg:sticky lg:top-24">
          <BookingForm
            id="booking-form"
            venue={venue}
            locations={locations}
            date={date}
            onDateChange={setDate}
          />
        </div>
      </div>

      {/* Mobile: the form sits far below the fold, so surface a sticky CTA. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 p-3 backdrop-blur lg:hidden">
        <a
          href="#booking-form"
          className={primaryPillClass("w-full py-2.5")}
          onClick={(e) => {
            e.preventDefault();
            document
              .getElementById("booking-form")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          Book a table at {venue.name}
        </a>
      </div>
    </div>
  );
}
