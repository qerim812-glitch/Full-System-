import { useRouter } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { deleteMyReview, upsertMyReview, type Review } from "../lib/reviews";
import { cn } from "../lib/utils";
import { ConfirmButton } from "./ConfirmButton";
import { pillClass, primaryPillClass } from "./PageChrome";
import { Textarea } from "./ui/textarea";

const LABELS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

export function ReviewForm({
  venueSlug,
  existing,
}: {
  venueSlug: string;
  existing: Review | null;
}) {
  const router = useRouter();
  const [rating, setRating] = useState<number>(existing?.rating ?? 5);
  const [hovered, setHovered] = useState<number | null>(null);
  const [comment, setComment] = useState<string>(existing?.comment ?? "");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const result = await upsertMyReview({
        data: { venueSlug, rating, comment: comment.trim() || undefined },
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

  const displayRating = hovered ?? rating;

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-foreground">
        {existing ? "Edit your review" : "Leave a review"}
      </h3>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs font-medium text-muted-foreground">
          Rating
        </legend>
        <div
          className="flex items-center gap-1"
          onMouseLeave={() => setHovered(null)}
          role="radiogroup"
          aria-label="Rating"
        >
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={rating === star}
              onClick={() => setRating(star)}
              onMouseEnter={() => setHovered(star)}
              onFocus={() => setHovered(star)}
              onBlur={() => setHovered(null)}
              aria-label={`${star} star${star !== 1 ? "s" : ""} — ${LABELS[star]}`}
              className="rounded-full p-1 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Star
                aria-hidden
                className={cn(
                  "h-6 w-6 transition-colors",
                  star <= displayRating
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground/30",
                )}
              />
            </button>
          ))}
          <span
            className="ml-2 text-sm font-semibold text-foreground"
            aria-live="polite"
          >
            {displayRating} / 5 · {LABELS[displayRating]}
          </span>
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="review-comment"
          className="text-xs font-medium text-muted-foreground"
        >
          Comment <span className="text-muted-foreground/60">(optional)</span>
        </label>
        <Textarea
          id="review-comment"
          value={comment}
          maxLength={2000}
          onChange={(e) => setComment(e.target.value)}
          placeholder="How was it?"
          rows={3}
          className="rounded-xl"
        />
        <p className="text-xs text-muted-foreground">{comment.length} / 2000</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={primaryPillClass()}>
          {pending ? "Saving…" : existing ? "Update review" : "Post review"}
        </button>
        {existing ? (
          <ConfirmButton
            title="Remove your review?"
            description="Your rating and comment for this venue will be deleted."
            confirmLabel="Remove"
            onConfirm={handleDelete}
            disabled={pending}
            className={pillClass(undefined, { danger: true })}
          >
            Remove
          </ConfirmButton>
        ) : null}
      </div>
    </form>
  );
}
