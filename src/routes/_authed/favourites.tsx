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
    // favorites holds slugs; resolve them against the venue list rather than
    // adding a joined query, since the list is small and already cached here.
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Favourites
        </h1>
        <p className="text-sm text-muted-foreground">
          {venues.length === 0
            ? "Places you save will show up here."
            : `${venues.length} saved ${venues.length === 1 ? "place" : "places"}.`}
        </p>
      </div>

      {venues.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <h2 className="text-base font-semibold text-foreground">
            Nothing saved yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Tap the heart on any venue to keep it here.
          </p>
          <Link
            to="/venues"
            className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Browse venues
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {venues.map((venue) => (
            <li
              key={venue.slug}
              className="relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md"
            >
              <FavoriteButton
                venueSlug={venue.slug}
                initialFavorited
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
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
