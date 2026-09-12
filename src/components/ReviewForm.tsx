import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { deleteMyReview, upsertMyReview, type Review } from "../lib/reviews";
import { Textarea } from "./ui/textarea";

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
      if (!result.ok) { toast.error(result.error); return; }
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
      if (!result.ok) { toast.error(result.error); return; }
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

      {/* Star picker */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Rating</span>
        <div
          className="flex gap-1"
          onMouseLeave={() => setHovered(null)}
          role="group"
          aria-label="Rating"
        >
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHovered(star)}
              aria-label={`${star} star${star !== 1 ? "s" : ""}`}
              className="p-0.5 transition-transform hover:scale-110"
            >
              <svg
                className={`h-6 w-6 transition-colors ${
                  star <= displayRating
                    ? "text-accent-foreground"
                    : "text-muted-foreground/30"
                }`}
                viewBox="0 0 24 24"
                fill={star <= displayRating ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
          ))}
          <span className="ml-2 self-center text-sm font-semibold text-foreground">
            {displayRating} / 5
          </span>
        </div>
      </div>

      {/* Comment */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="review-comment" className="text-xs font-medium text-muted-foreground">
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
        <p className="text-[10px] text-muted-foreground">{comment.length} / 2000</p>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : existing ? "Update review" : "Post review"}
        </button>
        {existing && (
          <button
            type="button"
            disabled={pending}
            onClick={handleDelete}
            className="rounded-full border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive transition-all hover:bg-destructive/10 disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div>
    </form>
  );
}
