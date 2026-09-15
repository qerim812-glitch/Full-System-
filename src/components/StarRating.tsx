import { Star } from "lucide-react";

import { cn } from "../lib/utils";

/** Read-only 1–5 star display with a real accessible name. */
export function StarRating({
  rating,
  size = "sm",
  className,
}: {
  rating: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const rounded = Math.round(rating);
  return (
    <span
      role="img"
      aria-label={`${rating.toFixed(rating % 1 === 0 ? 0 : 1)} out of 5 stars`}
      className={cn("inline-flex gap-0.5", className)}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          aria-hidden
          className={cn(
            size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5",
            i < rounded
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/40",
          )}
        />
      ))}
    </span>
  );
}
