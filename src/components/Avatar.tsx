import { initialFor } from "../lib/people";
import { cn } from "../lib/utils";

const SIZES = {
  xs: "h-6 w-6 text-[11px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-2xl",
  xl: "h-24 w-24 text-3xl",
} as const;

/**
 * Member avatar with an initial fallback. Renders `avatar_url` when present —
 * every list previously ignored the URL and drew a letter for everyone.
 */
export function Avatar({
  name,
  url,
  size = "md",
  className,
  tone = "accent",
}: {
  name: string | null | undefined;
  url?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
  tone?: "accent" | "muted";
}) {
  const label = name?.trim() || "Member";
  if (url) {
    return (
      <img
        src={url}
        alt={label}
        loading="lazy"
        className={cn(
          "shrink-0 rounded-full object-cover",
          SIZES[size],
          className,
        )}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        tone === "accent"
          ? "bg-accent text-accent-foreground"
          : "bg-muted text-muted-foreground",
        SIZES[size],
        className,
      )}
    >
      {initialFor(label)}
    </div>
  );
}
