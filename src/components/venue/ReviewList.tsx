import { Link } from "@tanstack/react-router";

import { formatDate } from "../../lib/utils";
import type { VenueReview } from "../../lib/venues";
import { Avatar } from "../Avatar";
import { StarRating } from "../StarRating";

export function ReviewList({ reviews }: { reviews: VenueReview[] }) {
  if (reviews.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No reviews yet. Be the first after your visit.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {reviews.map((review) => (
        <li
          key={review.id}
          className="rounded-2xl border border-border bg-card p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Avatar
                name={review.author_name}
                url={review.author_avatar}
                size="sm"
                tone="muted"
              />
              <Link
                to="/people/$userId"
                params={{ userId: review.user_id }}
                className="text-xs font-medium text-foreground hover:underline"
              >
                {review.author_name}
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <StarRating rating={review.rating} />
              <span className="text-xs text-muted-foreground">
                {review.rating}/5
              </span>
            </div>
          </div>
          {review.comment ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {review.comment}
            </p>
          ) : null}
          <time
            dateTime={review.created_at}
            className="mt-1.5 block text-[11px] text-muted-foreground"
          >
            {formatDate(review.created_at)}
          </time>
        </li>
      ))}
    </ul>
  );
}
