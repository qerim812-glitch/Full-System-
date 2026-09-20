import { Link } from "@tanstack/react-router";

import { formatDate } from "../../lib/utils";
import type { VenueReview } from "../../lib/venues";
import { Avatar } from "../Avatar";
import { ReportDialog } from "../ReportDialog";
import { StarRating } from "../StarRating";

/**
 * `myReviewId` identifies the caller's own review, which gets no report
 * control. A member can only have one review per venue (the unique constraint
 * on reviews), so that id is enough to recognise it without the route having
 * to thread the current user id down here.
 */
export function ReviewList({
  reviews,
  venueSlug,
  myReviewId,
}: {
  reviews: VenueReview[];
  venueSlug: string;
  myReviewId?: string | undefined;
}) {
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
          {review.photo_url ? (
            <a
              href={review.photo_url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-3 block w-fit"
            >
              <img
                src={review.photo_url}
                alt={`Photo from ${review.author_name}'s review`}
                loading="lazy"
                className="max-h-56 rounded-xl object-cover"
              />
            </a>
          ) : null}
          <div className="mt-1.5 flex items-center gap-3">
            <time
              dateTime={review.created_at}
              className="block text-[11px] text-muted-foreground"
            >
              {formatDate(review.created_at)}
            </time>
            {review.id !== myReviewId ? (
              <ReportDialog
                compact
                venueSlug={venueSlug}
                reportedUserId={review.user_id}
                targetKind="review"
                targetId={review.id}
              />
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
