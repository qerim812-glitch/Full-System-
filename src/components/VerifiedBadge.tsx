import { BadgeCheck } from "lucide-react";

/**
 * Shown when an admin has compared someone's verification photo with their
 * profile picture.
 *
 * It claims exactly that and no more — not that they are safe, not that they
 * are who their name says. `title` and the screen-reader text say so, because
 * a badge people misread as a safety guarantee is worse than no badge.
 */
export function VerifiedBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  return (
    <span
      title="Photo checked by a moderator"
      className="inline-flex shrink-0 items-center text-accent-foreground"
    >
      <BadgeCheck
        className={size === "md" ? "h-5 w-5" : "h-4 w-4"}
        aria-hidden
      />
      <span className="sr-only">Photo checked by a moderator</span>
    </span>
  );
}
