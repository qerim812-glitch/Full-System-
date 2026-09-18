import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  ADMIN_PAGE_SIZE,
  exportReviewsCsv,
  fetchAdminReviews,
  setContentHidden,
  type AdminPage,
  type AdminReview,
  type AdminVenue,
} from "../../lib/admin";
import { formatDate } from "../../lib/utils";
import { Chip, SearchInput, pillClass } from "../PageChrome";
import { StarRating } from "../StarRating";
import { EmptyCard } from "./EmptyCard";
import { ExportButton } from "./ExportButton";

const EMPTY: AdminPage<AdminReview> = { rows: [], total: 0 };

/**
 * Every review, filterable by venue, star rating and visibility.
 *
 * Separate from the moderation feed on purpose: that feed answers "what has
 * been posted lately across everything", this answers "show me the one-star
 * reviews of this venue" — which the feed's fixed 50-row window could not.
 */
export function ReviewsPanel({ venues }: { venues: AdminVenue[] }) {
  const [venueSlug, setVenueSlug] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [hidden, setHidden] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Bumped after a hide/unhide to re-run the query without duplicating it.
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const term = search.trim();
    const timer = setTimeout(() => {
      setLoading(true);
      fetchAdminReviews({
        data: {
          page,
          ...(venueSlug ? { venueSlug } : {}),
          ...(rating === null ? {} : { rating }),
          ...(hidden === null ? {} : { hidden }),
          ...(term ? { search: term } : {}),
        },
      })
        .then((rows) => {
          if (!cancelled) setResult(rows);
        })
        .catch(() => {
          if (!cancelled) toast.error("Could not load reviews.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [venueSlug, rating, hidden, search, page, refreshKey]);

  async function toggleHidden(review: AdminReview) {
    setBusyId(review.id);
    try {
      const response = await setContentHidden({
        data: { kind: "review", id: review.id, hidden: !review.is_hidden },
      });
      if (!response.ok) {
        toast.error(response.error);
        return;
      }
      toast.success(review.is_hidden ? "Review restored" : "Review hidden");
      setRefreshKey((key) => key + 1);
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusyId(null);
    }
  }

  const pageCount = Math.max(1, Math.ceil(result.total / ADMIN_PAGE_SIZE));
  const resetPage =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(0);
    };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={resetPage(setSearch)}
          placeholder="Search review text…"
          label="Search reviews"
        />
        <select
          value={venueSlug}
          onChange={(event) => resetPage(setVenueSlug)(event.target.value)}
          aria-label="Filter by venue"
          className="h-9 rounded-full border border-border bg-card px-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All venues</option>
          {venues.map((venue) => (
            <option key={venue.slug} value={venue.slug}>
              {venue.name}
            </option>
          ))}
        </select>

        <div
          className="flex gap-1.5"
          role="group"
          aria-label="Filter by rating"
        >
          {[1, 2, 3, 4, 5].map((star) => (
            <Chip
              key={star}
              active={rating === star}
              onClick={() =>
                resetPage(setRating)(rating === star ? null : star)
              }
              className="px-3 py-1 text-xs"
            >
              {star}★
            </Chip>
          ))}
        </div>

        <Chip
          active={hidden === true}
          onClick={() => resetPage(setHidden)(hidden === true ? null : true)}
          className="px-3 py-1 text-xs"
        >
          Hidden only
        </Chip>

        <span className="text-xs text-muted-foreground">
          {loading ? "Loading…" : `${result.total} reviews`}
        </span>
        <ExportButton
          label="Export CSV"
          filename="reviews"
          fetchCsv={exportReviewsCsv}
        />
      </div>

      {result.rows.length === 0 && !loading ? (
        <EmptyCard text="No reviews match those filters." />
      ) : (
        <ul className="flex flex-col gap-2">
          {result.rows.map((review) => (
            <li
              key={review.id}
              className="flex flex-wrap items-start gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StarRating rating={review.rating} />
                  <span className="text-sm font-medium text-foreground">
                    {review.venue_name ?? review.venue_slug}
                  </span>
                  {review.is_hidden ? (
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                      Hidden
                    </span>
                  ) : null}
                </div>
                {review.comment ? (
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {review.comment}
                  </p>
                ) : (
                  <p className="text-sm italic text-muted-foreground">
                    Rating only, no comment.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {review.author_name ?? review.author_email ?? "Unknown"} ·{" "}
                  {formatDate(review.created_at)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => void toggleHidden(review)}
                disabled={busyId === review.id}
                className={pillClass("gap-1.5 text-xs", {
                  danger: !review.is_hidden,
                })}
              >
                {review.is_hidden ? (
                  <Eye className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" aria-hidden />
                )}
                {review.is_hidden ? "Restore" : "Hide"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 ? (
        <nav
          className="flex items-center justify-center gap-3"
          aria-label="Review pages"
        >
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className={pillClass("text-xs")}
          >
            Previous
          </button>
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1 || loading}
            className={pillClass("text-xs")}
          >
            Next
          </button>
        </nav>
      ) : null}
    </div>
  );
}
