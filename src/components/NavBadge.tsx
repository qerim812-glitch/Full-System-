import { badgeText } from "./nav-items";
import { cn } from "../lib/utils";

/** Small unread-count pill pinned to the top-right corner of an icon. */
export function NavBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-accent-foreground",
        className,
      )}
      aria-hidden
    >
      {badgeText(count)}
    </span>
  );
}
