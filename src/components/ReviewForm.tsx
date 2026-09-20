import { useRouter } from "@tanstack/react-router";
import { ImagePlus, Star, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import {
  deleteMyReview,
  removeReviewPhoto,
  REVIEW_PHOTO_MAX_BYTES,
  uploadReviewPhoto,
  upsertMyReview,
  type Review,
} from "../lib/reviews";
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
  const [photoUrl, setPhotoUrl] = useState<string | null>(
    existing?.photo_url ?? null,
  );
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > REVIEW_PHOTO_MAX_BYTES) {
      toast.error("Photos must be under 5 MB.");
      return;
    }
    setPhotoBusy(true);
    try {
      // The photo hangs off the review row, so make sure one exists first.
      if (!existing) {
        const saved = await upsertMyReview({
          data: { venueSlug, rating, comment: comment.trim() || undefined },
        });
        if (!saved.ok) {
          toast.error(saved.error);
          return;
        }
      }
      const form = new FormData();
      form.append("venueSlug", venueSlug);
      form.append("photo", file);
      const result = await uploadReviewPhoto({ data: form });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setPhotoUrl(result.photoUrl);
      toast.success("Photo added.");
      await router.invalidate();
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleRemovePhoto() {
    setPhotoBusy(true);
    try {
      const result = await removeReviewPhoto({ data: { venueSlug } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setPhotoUrl(null);
      await router.invalidate();
    } finally {
      setPhotoBusy(false);
    }
  }

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

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Photo <span className="text-muted-foreground/60">(optional)</span>
        </span>
        {photoUrl ? (
          <div className="relative w-fit">
            <img
              src={photoUrl}
              alt="Your review photo"
              className="max-h-48 rounded-xl object-cover"
            />
            <button
              type="button"
              onClick={() => void handleRemovePhoto()}
              disabled={photoBusy}
              className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
              aria-label="Remove photo"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => void handlePhoto(e)}
          className="sr-only"
          aria-label="Choose a photo for your review"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={photoBusy}
          className={pillClass("w-fit gap-1.5 text-xs")}
        >
          <ImagePlus className="h-3.5 w-3.5" aria-hidden />
          {photoBusy ? "Uploading…" : photoUrl ? "Change photo" : "Add a photo"}
        </button>
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
