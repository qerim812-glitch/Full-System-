/**
 * Client-side filtering and sorting for the venue list.
 * Pure — tested in src/lib/__tests__/venue-filters.test.ts.
 */

export type AgeFilter = "any" | "me" | "18" | "21" | "u35";
export type VenueSort = "name" | "rating" | "capacity" | "distance";

type FilterableVenue = {
  name: string;
  description: string;
  min_age: number;
  max_age: number;
  capacity: number;
  category?: string | null;
  average_rating?: number | null;
  review_count?: number | null;
  lat?: number | null;
  lng?: number | null;
};

export type LatLng = { lat: number; lng: number };

/** Great-circle distance in kilometres (haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "350 m" under a kilometre, otherwise "2.4 km". */
export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 100) * 10} m` : `${km.toFixed(1)} km`;
}

/** Distance from `origin`, or null when the venue has no coordinates. */
export function venueDistanceKm(
  venue: { lat?: number | null; lng?: number | null },
  origin: LatLng | null,
): number | null {
  if (!origin || venue.lat == null || venue.lng == null) return null;
  return distanceKm(origin, { lat: venue.lat, lng: venue.lng });
}

export function matchesAgeFilter(
  venue: Pick<FilterableVenue, "min_age" | "max_age">,
  filter: AgeFilter,
  myAge: number | null,
): boolean {
  switch (filter) {
    case "any":
      return true;
    case "me":
      return myAge === null
        ? true
        : venue.min_age <= myAge && myAge <= venue.max_age;
    case "18":
      return venue.min_age <= 18;
    case "21":
      return venue.min_age >= 21;
    case "u35":
      return venue.max_age <= 35;
  }
}

export function filterVenues<V extends FilterableVenue>(
  venues: readonly V[],
  opts: {
    query: string;
    minCapacity: number;
    age: AgeFilter;
    myAge: number | null;
    category: string | "all";
  },
): V[] {
  const term = opts.query.trim().toLowerCase();
  return venues.filter((v) => {
    if (
      term &&
      !v.name.toLowerCase().includes(term) &&
      !v.description.toLowerCase().includes(term)
    )
      return false;
    if (v.capacity < opts.minCapacity) return false;
    if (!matchesAgeFilter(v, opts.age, opts.myAge)) return false;
    if (opts.category !== "all" && (v.category ?? "cafe") !== opts.category)
      return false;
    return true;
  });
}

export function sortVenues<V extends FilterableVenue>(
  venues: readonly V[],
  sort: VenueSort,
  origin: LatLng | null = null,
): V[] {
  const copy = [...venues];
  switch (sort) {
    case "distance": {
      // Venues without coordinates sink to the bottom rather than vanishing.
      const far = Number.POSITIVE_INFINITY;
      return copy.sort(
        (a, b) =>
          (venueDistanceKm(a, origin) ?? far) -
            (venueDistanceKm(b, origin) ?? far) || a.name.localeCompare(b.name),
      );
    }
    case "rating":
      return copy.sort(
        (a, b) =>
          (b.average_rating ?? 0) - (a.average_rating ?? 0) ||
          (b.review_count ?? 0) - (a.review_count ?? 0) ||
          a.name.localeCompare(b.name),
      );
    case "capacity":
      return copy.sort(
        (a, b) => b.capacity - a.capacity || a.name.localeCompare(b.name),
      );
    default:
      return copy.sort((a, b) => a.name.localeCompare(b.name));
  }
}

export const VENUE_CATEGORIES = [
  { value: "cafe", label: "Café" },
  { value: "lounge", label: "Lounge" },
  { value: "bar", label: "Bar" },
  { value: "restaurant", label: "Restaurant" },
  { value: "club", label: "Club" },
  { value: "garden", label: "Garden" },
] as const;

export function categoryLabel(value: string | null | undefined): string {
  return VENUE_CATEGORIES.find((c) => c.value === value)?.label ?? "Café";
}

/** "€€" style label from a 1–4 price band. */
export function priceBandLabel(band: number | null | undefined): string {
  const n = Math.min(4, Math.max(1, band ?? 2));
  return "€".repeat(n);
}
