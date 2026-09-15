import { Link } from "@tanstack/react-router";
import { Clock, MapPin, Users } from "lucide-react";

import { formatHours } from "../lib/slots";
import { categoryLabel, priceBandLabel } from "../lib/venue-filters";
import type { Venue } from "../lib/venues";
import { FavoriteButton } from "./FavoriteButton";
import { StarRating } from "./StarRating";

/**
 * One venue in a grid. Shared by /venues, /favourites and the public landing
 * page (where `favorited` is undefined and the heart is hidden).
 */
export function VenueCard({
  venue,
  favorited,
  linkToLogin = false,
}: {
  venue: Venue;
  favorited?: boolean;
  linkToLogin?: boolean;
}) {
  const body = (
    <>
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
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold leading-tight text-foreground">
            {venue.name}
          </h2>
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {categoryLabel(venue.category)} · {priceBandLabel(venue.price_band)}
          </span>
        </div>

        {venue.average_rating !== null ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <StarRating rating={venue.average_rating} />
            <span className="font-medium text-foreground">
              {venue.average_rating.toFixed(1)}
            </span>
            <span>
              ({venue.review_count} review{venue.review_count === 1 ? "" : "s"})
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No reviews yet</p>
        )}

        <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
          {venue.description}
        </p>

        <dl className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            <dt className="sr-only">Hours</dt>
            <dd>{formatHours(venue)}</dd>
          </div>
          <div className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" aria-hidden />
            <dt className="sr-only">Capacity and ages</dt>
            <dd>
              {venue.capacity} seats · ages {venue.min_age}–{venue.max_age}
            </dd>
          </div>
          {venue.address ? (
            <div className="flex min-w-0 items-center gap-1">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <dt className="sr-only">Address</dt>
              <dd className="truncate">{venue.address}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </>
  );

  const linkClass =
    "flex h-full flex-col focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  return (
    <li className="relative flex flex-col overflow-hidden rounded-2xl bg-card shadow-sm transition-shadow hover:shadow-md">
      {favorited !== undefined ? (
        <FavoriteButton
          venueSlug={venue.slug}
          initialFavorited={favorited}
          className="absolute right-3 top-3 z-10"
        />
      ) : null}
      {linkToLogin ? (
        <Link
          to="/login"
          search={{ redirect: `/venues/${venue.slug}` }}
          className={linkClass}
        >
          {body}
        </Link>
      ) : (
        <Link
          to="/venues/$slug"
          params={{ slug: venue.slug }}
          className={linkClass}
        >
          {body}
        </Link>
      )}
    </li>
  );
}
