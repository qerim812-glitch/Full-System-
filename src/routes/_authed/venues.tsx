import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { EmptyState } from "../../components/EmptyState";
import {
  Chip,
  PageHeader,
  RouteError,
  SearchInput,
} from "../../components/PageChrome";
import {
  StatChipSkeleton,
  VenueCardSkeletonGrid,
} from "../../components/Skeletons";
import { StatChip } from "../../components/StatChip";
import { VenueCard } from "../../components/VenueCard";
import { fetchMyFavorites } from "../../lib/favorites";
import { fetchMyProfile } from "../../lib/profile";
import { pageHead } from "../../lib/seo";
import { ageFromDob } from "../../lib/utils";
import {
  filterVenues,
  sortVenues,
  VENUE_CATEGORIES,
  type AgeFilter,
  type VenueSort,
} from "../../lib/venue-filters";
import { fetchVenues } from "../../lib/venues";

export const Route = createFileRoute("/_authed/venues")({
  loader: async () => {
    const [venues, favorites, profile] = await Promise.all([
      fetchVenues(),
      fetchMyFavorites(),
      fetchMyProfile(),
    ]);
    const myAge = profile ? ageFromDob(profile.date_of_birth) : null;
    return { venues, favorites, myAge };
  },
  head: () => pageHead("Venues"),
  pendingComponent: VenuesSkeleton,
  component: VenuesPage,
  errorComponent: () => (
    <RouteError
      title="Could not load venues"
      body="The venue list is unavailable right now. Please try again in a moment."
    />
  ),
});

function VenuesSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy>
      <div className="flex flex-col gap-1">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded-lg bg-muted" />
      </div>
      <StatChipSkeleton count={4} />
      <VenueCardSkeletonGrid count={6} />
    </div>
  );
}

const CAPACITY_STEPS = [0, 40, 60, 80];

function VenuesPage() {
  const { venues, favorites, myAge } = Route.useLoaderData();
  const [query, setQuery] = useState("");
  const [minCap, setMinCap] = useState(0);
  const [age, setAge] = useState<AgeFilter>("any");
  const [category, setCategory] = useState<string>("all");
  const [sort, setSort] = useState<VenueSort>("name");
  const favoriteSet = new Set(favorites);

  const visible = sortVenues(
    filterVenues(venues, { query, minCapacity: minCap, age, myAge, category }),
    sort,
  );

  const rated = venues.filter((v) => v.average_rating !== null);
  const avgRating = rated.length
    ? rated.reduce((s, v) => s + (v.average_rating ?? 0), 0) / rated.length
    : null;
  const usedCategories = new Set(venues.map((v) => v.category));

  const ageSteps: Array<{ label: string; value: AgeFilter }> = [
    { label: "Any age", value: "any" },
    ...(myAge !== null
      ? [{ label: `Admits me (${myAge})`, value: "me" as const }]
      : []),
    { label: "Open to 18+", value: "18" },
    { label: "21+ only", value: "21" },
    { label: "Under-35 crowd", value: "u35" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Venues"
        subtitle="Book a table at cafés and lounges across Tirana."
      />

      <div className="flex flex-wrap gap-4">
        <StatChip label="Venues" value={String(venues.length)} />
        <StatChip
          label="Average rating"
          value={avgRating ? `${avgRating.toFixed(1)} / 5` : "—"}
        />
        <StatChip
          label="Total seats"
          value={String(venues.reduce((s, v) => s + v.capacity, 0))}
        />
        <StatChip label="Favourites" value={String(favorites.length)} accent />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search venues…"
            label="Search venues"
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as VenueSort)}
              className="h-10 rounded-full border border-border bg-card px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="name">Name</option>
              <option value="rating">Highest rated</option>
              <option value="capacity">Largest</option>
            </select>
          </label>
        </div>

        {usedCategories.size > 1 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Type:</span>
            <Chip
              active={category === "all"}
              onClick={() => setCategory("all")}
            >
              All
            </Chip>
            {VENUE_CATEGORIES.filter((c) => usedCategories.has(c.value)).map(
              (c) => (
                <Chip
                  key={c.value}
                  active={category === c.value}
                  onClick={() => setCategory(c.value)}
                >
                  {c.label}
                </Chip>
              ),
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Min seats:</span>
          {CAPACITY_STEPS.map((cap) => (
            <Chip
              key={cap}
              active={minCap === cap}
              onClick={() => setMinCap(cap)}
            >
              {cap === 0 ? "Any" : `${cap}+`}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Age:</span>
          {ageSteps.map((a) => (
            <Chip
              key={a.value}
              active={age === a.value}
              onClick={() => setAge(a.value)}
            >
              {a.label}
            </Chip>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        venues.length === 0 ? (
          <EmptyState
            title="No venues yet"
            body="Venues will appear here as soon as they are added."
          />
        ) : (
          <EmptyState
            title="No venues match your filters"
            body="Try clearing the search or adjusting the filters."
          />
        )
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
