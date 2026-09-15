import { cn } from "../lib/utils";

/**
 * Small floating pill showing one key metric. Shared by every page's stats
 * strip so the look stays consistent (it used to be copy-pasted into nine
 * route files with drifting paddings).
 */
export function StatChip({
  label,
  value,
  accent = false,
  size = "md",
  className,
}: {
  label: string;
  value: string;
  accent?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 shadow-sm",
        size === "md"
          ? "min-w-[7rem] rounded-2xl px-5 py-3"
          : "min-w-[6rem] rounded-xl px-4 py-2.5",
        accent
          ? "bg-accent text-accent-foreground"
          : "border border-border bg-card",
        className,
      )}
    >
      <span
        className={cn(
          "font-medium text-muted-foreground",
          size === "md" ? "text-xs" : "text-[10px] uppercase tracking-wider",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "font-semibold leading-none text-foreground",
          size === "md" ? "text-xl" : "text-lg",
        )}
      >
        {value}
      </span>
    </div>
  );
}
