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
  const [minCap, setMinCap] = useState(0);
  const [maxAge, setMaxAge] = useState(99);
  const favoriteSet = new Set(favorites);

  const term = query.trim().toLowerCase();
  const visible = venues.filter((v) => {
    if (term && !v.name.toLowerCase().includes(term) && !v.description.toLowerCase().includes(term)) return false;
    if (v.capacity < minCap) return false;
    if (v.min_age > maxAge) return false;
    return true;
  });

  const totalCapacity = venues.reduce((sum, v) => sum + v.capacity, 0);
  const avgAge = venues.length
    ? Math.round(venues.reduce((sum, v) => sum + (v.min_age + v.max_age) / 2, 0) / venues.length)
    : 0;

  const capacitySteps = [0, 40, 60, 80];
  const ageSteps = [
    { label: "All ages", value: 99 },
    { label: "18–25", value: 25 },
    { label: "18–35", value: 35 },
    { label: "21+", value: 99 },
  ];

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

      {/* ── Stats strip ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4">
        <StatChip label="Total venues" value={String(venues.length)} />
        <StatChip label="Total capacity" value={`${totalCapacity} seats`} />
        <StatChip label="Avg age group" value={`${avgAge} yrs`} />
        <StatChip label="Favourites" value={String(favorites.length)} accent />
      </div>

      {/* ── Search + filters ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Pill search */}
        <div className="relative">
          <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search venues…"
            aria-label="Search venues"
            className="h-9 w-52 rounded-full border border-border bg-card pl-9 pr-4 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Capacity filter chips */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Min seats:</span>
          {capacitySteps.map((cap) => (
            <button key={cap} onClick={() => setMinCap(cap)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                minCap === cap
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground"
              }`}>
              {cap === 0 ? "Any" : `${cap}+`}
            </button>
          ))}
        </div>

        {/* Age filter chips */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Age:</span>
          {ageSteps.map((a) => (
            <button key={a.label} onClick={() => setMaxAge(a.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                maxAge === a.value && (a.label !== "All ages" || maxAge === 99)
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground"
              }`}>
              {a.label}
            </button>
          ))}
        </div>
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
            title="No venues match your filters"
            body="Try clearing the search or adjusting the age and capacity filters."
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

/* ── Empty state with illustration ───────────────────────────────── */
export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-card px-6 py-14 text-center shadow-sm">
      {/* Simple abstract SVG illustration */}
      <svg
        className="mb-5 h-20 w-20 text-muted-foreground/30"
        viewBox="0 0 80 80"
        fill="none"
        aria-hidden
      >
        <circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="3" strokeDasharray="6 4" />
        <circle cx="40" cy="30" r="10" stroke="currentColor" strokeWidth="2.5" />
        <path d="M20 62c0-11.046 8.954-20 20-20s20 8.954 20 20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
