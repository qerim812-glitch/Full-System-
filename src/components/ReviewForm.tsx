import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { deleteMyReview, upsertMyReview, type Review } from "../lib/reviews";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

/**
 * Write, edit, or remove a review for a venue.
 *
 * `existing` is the caller's current review row (from `fetchMyReview`), or
 * null if they have not reviewed yet. The form title and submit label adapt
 * accordingly.
 *
 * If the user has no completed booking, the upsert will be rejected by the
 * "reviews: write own after visiting" RLS policy. `mapReviewError` in
 * src/lib/reviews.ts converts that Postgres message into readable copy.
 */
export function ReviewForm({
  venueSlug,
  existing,
}: {
  venueSlug: string;
  existing: Review | null;
}) {
  const router = useRouter();
  const [rating, setRating] = useState<number>(existing?.rating ?? 5);
  const [comment, setComment] = useState<string>(existing?.comment ?? "");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);

    try {
      const result = await upsertMyReview({
        data: {
          venueSlug,
          rating,
          comment: comment.trim() || undefined,
        },
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(existing ? "Review updated" : "Thanks for your review!");
      await router.invalidate();
    } catch {
      toast.error("Could not reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    setPending(true);

    try {
      const result = await deleteMyReview({ data: { venueSlug } });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Review removed");
      setComment("");
      setRating(5);
      await router.invalidate();
    } catch {
      toast.error("Could not reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-border bg-card p-4"
    >
      <h3 className="text-sm font-semibold text-foreground">
        {existing ? "Edit your review" : "Leave a review"}
      </h3>

      <div className="space-y-1">
        <Label htmlFor="review-rating">Rating</Label>
        <select
          id="review-rating"
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
          className="w-24 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
        >
          {([5, 4, 3, 2, 1] as const).map((n) => (
            <option key={n} value={n}>
              {n} / 5
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="review-comment">Comment (optional)</Label>
        <Textarea
          id="review-comment"
          value={comment}
          maxLength={2000}
          onChange={(e) => setComment(e.target.value)}
          placeholder="How was it?"
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          {comment.length}/2000 characters
        </p>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending} size="sm">
          {pending ? "Saving…" : existing ? "Update review" : "Post review"}
        </Button>
        {existing ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={handleDelete}
          >
            Remove
          </Button>
        ) : null}
      </div>
    </form>
  );
}
