import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { FavoriteButton } from "../../components/FavoriteButton";
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

  const totalCapacity = venues.reduce((sum, v) => sum + v.capacity, 0);
  const avgAge = venues.length
    ? Math.round(
        venues.reduce((sum, v) => sum + (v.min_age + v.max_age) / 2, 0) /
          venues.length,
      )
    : 0;

  return (
    <div className="flex flex-col gap-8">

      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Venues
        </h1>
        <p className="text-sm text-muted-foreground">
          Book a table at cafés and lounges across Tirana.
        </p>
      </div>

      {/* ── Stats strip — mirrors the vital-sign row in the reference ── */}
      <div className="flex flex-wrap gap-4">
        <StatChip label="Total venues" value={String(venues.length)} />
        <StatChip label="Total capacity" value={`${totalCapacity} seats`} />
        <StatChip label="Avg age group" value={`${avgAge} yrs`} />
        <StatChip label="Favourites" value={String(favorites.length)} accent />
      </div>

      {/* ── Filter chips + pill search ────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Pill-shaped search input */}
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search venues…"
            aria-label="Search venues"
            className="h-9 w-56 rounded-full border border-border bg-card pl-9 pr-4 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Quick filter chips */}
        {[
          { label: "All", active: !query },
          { label: "Favourites", active: false },
        ].map((chip) => (
          <button
            key={chip.label}
            onClick={() => chip.label === "All" && setQuery("")}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-all ${
              chip.active
                ? "border-transparent bg-primary text-primary-foreground shadow-none"
                : "border-border bg-card text-muted-foreground shadow-sm hover:border-foreground/20 hover:text-foreground"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* ── Venue card grid ──────────────────────────────────────── */}
      {visible.length === 0 ? (
        venues.length === 0 ? (
          <EmptyState
            title="No venues yet"
            body="Run supabase/seed/0001_venues.sql to load the Tirana venues."
          />
        ) : (
          <EmptyState
            title={`Nothing matches "${query}"`}
            body="Try a different name, or clear the search to see everywhere."
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

/* ── Stat chip — small floating pill showing a key metric ─────────── */
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
        accent
          ? "bg-accent text-accent-foreground"
          : "border border-border bg-card"
      }`}
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold leading-none text-foreground">
        {value}
      </span>
    </div>
  );
}

/* ── Venue card ───────────────────────────────────────────────────── */
function VenueCard({ venue, favorited }: { venue: Venue; favorited: boolean }) {
  return (
    <li className="relative flex flex-col overflow-hidden rounded-2xl bg-card shadow-sm transition-shadow hover:shadow-md">
      <FavoriteButton
        venueSlug={venue.slug}
        initialFavorited={favorited}
        className="absolute right-3 top-3 z-10"
      />
      <Link
        to="/venues/$slug"
        params={{ slug: venue.slug }}
        className="flex h-full flex-col focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {/* Image or warm placeholder */}
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

          {/* Capacity + age badge row */}
          <div className="flex items-center gap-2 pt-1">
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
  );
}

/* ── Empty state ──────────────────────────────────────────────────── */
export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {body}
      </p>
    </div>
  );
}
