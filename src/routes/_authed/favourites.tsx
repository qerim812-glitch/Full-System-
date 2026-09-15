import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { EmptyState } from "../../components/EmptyState";
import {
  PageHeader,
  RouteError,
  SearchInput,
  primaryPillClass,
} from "../../components/PageChrome";
import {
  StatChipSkeleton,
  VenueCardSkeletonGrid,
} from "../../components/Skeletons";
import { StatChip } from "../../components/StatChip";
import { VenueCard } from "../../components/VenueCard";
import { fetchMyFavorites } from "../../lib/favorites";
import { pageHead } from "../../lib/seo";
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
  head: () => pageHead("Favourites"),
  pendingComponent: () => (
    <div className="flex flex-col gap-8" aria-busy>
      <div className="h-8 w-36 animate-pulse rounded-lg bg-muted" />
      <StatChipSkeleton count={2} />
      <VenueCardSkeletonGrid count={3} />
    </div>
  ),
  errorComponent: () => <RouteError title="Could not load favourites" />,
  component: FavouritesPage,
});

function FavouritesPage() {
  const { venues } = Route.useLoaderData();
  const [query, setQuery] = useState("");

  const term = query.trim().toLowerCase();
  const visible = term
    ? venues.filter(
        (v) =>
          v.name.toLowerCase().includes(term) ||
          v.description.toLowerCase().includes(term),
      )
    : venues;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Favourites"
        subtitle={
          venues.length === 0
            ? "Places you save will show up here."
            : `${venues.length} saved ${venues.length === 1 ? "place" : "places"}.`
        }
      />

      {venues.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-4">
            <StatChip
              label="Saved venues"
              value={String(venues.length)}
              accent
            />
            <StatChip
              label="Total seats"
              value={String(venues.reduce((s, v) => s + v.capacity, 0))}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search your favourites…"
              label="Search favourites"
            />
            {query ? (
              <span className="text-xs text-muted-foreground">
                {visible.length} result{visible.length !== 1 ? "s" : ""}
              </span>
            ) : null}
          </div>
        </>
      ) : null}

      {venues.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          body="Tap the heart on any venue card to save it here."
          action={
            <Link to="/venues" className={primaryPillClass()}>
              Browse venues
            </Link>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No matches"
          body={`No favourites match "${query}". Try clearing the search.`}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((venue) => (
            <VenueCard key={venue.slug} venue={venue} favorited />
          ))}
        </ul>
      )}
    </div>
  );
}
