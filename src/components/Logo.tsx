import { cn } from "../lib/utils";

/**
 * The Social Circle mark: concentric rings resolving to a solid centre — a
 * circle of people around a place.
 *
 * Drawn as inline SVG rather than shipped as an image file for three reasons:
 * it stays sharp at any size, it costs no extra request, and it can take its
 * colours from the theme, so it works on the dark pill in the header and on a
 * light page without needing two exported files.
 *
 * `currentColor` on the rings means the caller sets the colour by setting text
 * colour; the dot keeps the brand yellow unless told otherwise.
 */
export function LogoMark({
  className,
  dotClassName,
  title,
}: {
  className?: string;
  dotClassName?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={cn("h-6 w-6", className)}
      // Decorative next to a wordmark; given a title it becomes an image with
      // an accessible name instead.
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <circle
        cx="24"
        cy="24"
        r="21"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.35"
      />
      <circle
        cx="24"
        cy="24"
        r="15"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.6"
      />
      <circle
        cx="24"
        cy="24"
        r="9"
        className={cn("fill-brand", dotClassName)}
      />
    </svg>
  );
}

/**
 * Mark plus wordmark, for the header pill and the auth screens.
 *
 * `whitespace-nowrap` because "Social Circle" is two words and a fixed-height
 * pill would otherwise wrap it at narrow widths.
 */
export function Logo({
  className,
  markClassName,
  showText = true,
}: {
  className?: string;
  markClassName?: string;
  showText?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap",
        className,
      )}
    >
      <LogoMark className={cn("h-5 w-5", markClassName)} />
      {showText ? <span className="font-semibold">Social Circle</span> : null}
    </span>
  );
}
