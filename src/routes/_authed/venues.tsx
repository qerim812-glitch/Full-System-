import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { FavoriteButton } from "../../components/FavoriteButton";
import { Input } from "../../components/ui/input";
import { fetchMyFavorites } from "../../lib/favorites";
import { fetchVenues, type Venue } from "../../lib/venues";

export const Route = createFileRoute("/_authed/venues")({
  loader: async () => {
    const [venues, favorites] = await Promise.all([
      fetchVenues(),
      fetchMyFavorites(),
    ]);
    return { venues, favorites };
  },
  component: VenuesPage,
  errorComponent: () => (
    <EmptyState
      title="Could not load venues"
      body="The venue list is unavailable. If the database migrations have not been run yet, apply supabase/migrations in order and refresh."
    />
  ),
});

function VenuesPage() {
  const { venues, favorites } = Route.useLoaderData();
  const [query, setQuery] = useState("");
  const favoriteSet = new Set(favorites);

  const term = query.trim().toLowerCase();
  const visible = term
    ? venues.filter(
        (v) =>
          v.name.toLowerCase().includes(term) ||
          v.description.toLowerCase().includes(term),
      )
    : venues;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Venues
        </h1>
        <p className="text-sm text-muted-foreground">
          {venues.length} places across Tirana. Pick one to see times and book a
          table.
        </p>
      </div>

      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or vibe…"
        className="max-w-sm"
        aria-label="Search venues"
      />

      {visible.length === 0 ? (
        venues.length === 0 ? (
          <EmptyState
            title="No venues yet"
            body="Run supabase/seed/0001_venues.sql to load the seven Tirana venues."
          />
        ) : (
          <EmptyState
            title={`Nothing matches “${query}”`}
            body="Try a different name, or clear the search to see everywhere."
          />
        )
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((venue) => (
            <VenueCard
              key={venue.slug}
              venue={venue}
              favorited={favoriteSet.has(venue.slug)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function VenueCard({ venue, favorited }: { venue: Venue; favorited: boolean }) {
  return (
    // `relative` makes this the positioning context for the favourite button,
    // which is a sibling of the Link rather than a child: a <button> nested
    // inside an <a> is invalid HTML.
    <li className="relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md">
      <FavoriteButton
        venueSlug={venue.slug}
        initialFavorited={favorited}
        className="absolute right-2 top-2 z-10"
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

        <div className="flex flex-1 flex-col gap-2 p-4">
          <h2 className="text-base font-semibold leading-tight text-foreground">
            {venue.name}
          </h2>
          <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
            {venue.description}
          </p>
          <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
            <span className="rounded-full border border-border px-2 py-0.5">
              Ages {venue.min_age}–{venue.max_age}
            </span>
            <span>{venue.capacity} seats</span>
          </div>
        </div>
      </Link>
    </li>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {body}
      </p>
    </div>
  );
}
