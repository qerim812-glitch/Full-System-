import { createFileRoute, Link } from "@tanstack/react-router";

import { FavoriteButton } from "../../components/FavoriteButton";
import { fetchMyFavorites } from "../../lib/favorites";
import { fetchVenues } from "../../lib/venues";

export const Route = createFileRoute("/_authed/favourites")({
  loader: async () => {
    const [venues, favorites] = await Promise.all([
      fetchVenues(),
      fetchMyFavorites(),
    ]);
    const bySlug = new Map(venues.map((v) => [v.slug, v]));
    return {
      venues: favorites
        .map((slug) => bySlug.get(slug))
        .filter((v): v is NonNullable<typeof v> => v !== undefined),
    };
  },
  component: FavouritesPage,
});

function FavouritesPage() {
  const { venues } = Route.useLoaderData();

  return (
    <div className="flex flex-col gap-8">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Favourites
        </h1>
        <p className="text-sm text-muted-foreground">
          {venues.length === 0
            ? "Places you save will show up here."
            : `${venues.length} saved ${venues.length === 1 ? "place" : "places"}.`}
        </p>
      </div>

      {/* ── Stats strip ─────────────────────────────────────────── */}
      {venues.length > 0 && (
        <div className="flex flex-wrap gap-4">
          <StatChip label="Saved venues" value={String(venues.length)} accent />
          <StatChip
            label="Total capacity"
            value={`${venues.reduce((s, v) => s + v.capacity, 0)} seats`}
          />
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────── */}
      {venues.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent">
            <svg
              className="h-6 w-6 text-accent-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-foreground">
            Nothing saved yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Tap the heart on any venue card to save it here.
          </p>
          <Link
            to="/venues"
            className="mt-5 inline-flex items-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Browse venues
          </Link>
        </div>
      ) : (
        /* ── Venue grid ─────────────────────────────────────────── */
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {venues.map((venue) => (
            <li
              key={venue.slug}
              className="relative flex flex-col overflow-hidden rounded-2xl bg-card shadow-sm transition-shadow hover:shadow-md"
            >
              <FavoriteButton
                venueSlug={venue.slug}
                initialFavorited
                className="absolute right-3 top-3 z-10"
              />
              <Link
                to="/venues/$slug"
                params={{ slug: venue.slug }}
                className="flex h-full flex-col focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {venue.image_url ? (
                  <img
                    src={venue.image_url}
                    alt=""
                    loading="lazy"
                    className="aspect-[3/2] w-full object-cover"
                  />
                ) : (
                  <div className="aspect-[3/2] w-full bg-muted" />
                )}
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <h2 className="text-base font-semibold leading-tight text-foreground">
                    {venue.name}
                  </h2>
                  <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
                    {venue.description}
                  </p>
                  <div className="flex gap-2 pt-1">
                    <span className="rounded-full bg-muted px-3 py-0.5 text-xs font-medium text-muted-foreground">
                      {venue.capacity} seats
                    </span>
                    <span className="rounded-full bg-muted px-3 py-0.5 text-xs font-medium text-muted-foreground">
                      Ages {venue.min_age}–{venue.max_age}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
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
      className={`flex min-w-[7rem] flex-col gap-0.5 rounded-2xl px-5 py-3 shadow-sm ${
        accent ? "bg-accent text-accent-foreground" : "border border-border bg-card"
      }`}
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold leading-none text-foreground">{value}</span>
    </div>
  );
}
