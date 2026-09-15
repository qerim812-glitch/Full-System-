/**
 * Client-side filtering and sorting for the venue list.
 * Pure — tested in src/lib/__tests__/venue-filters.test.ts.
 */

export type AgeFilter = "any" | "me" | "18" | "21" | "u35";
export type VenueSort = "name" | "rating" | "capacity";

type FilterableVenue = {
  name: string;
  description: string;
  min_age: number;
  max_age: number;
  capacity: number;
  category?: string | null;
  average_rating?: number | null;
  review_count?: number | null;
};

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
): V[] {
  const copy = [...venues];
  switch (sort) {
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
