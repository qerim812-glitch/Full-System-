/**
 * Skeleton components for loading states.
 * Used across venue cards, booking rows, and message threads.
 */

import { cn } from "../lib/utils";

function Pulse({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

/* ── Venue card skeleton ─────────────────────────────────────────── */
export function VenueCardSkeleton() {
  return (
    <li className="flex flex-col overflow-hidden rounded-2xl bg-card shadow-sm">
      {/* Image placeholder */}
      <Pulse className="aspect-[3/2] w-full rounded-none" />
      <div className="flex flex-col gap-3 p-5">
        <Pulse className="h-4 w-2/3" />
        <Pulse className="h-3 w-full" />
        <Pulse className="h-3 w-4/5" />
        <div className="flex gap-2 pt-1">
          <Pulse className="h-5 w-16 rounded-full" />
          <Pulse className="h-5 w-20 rounded-full" />
        </div>
      </div>
    </li>
  );
}

export function VenueCardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <VenueCardSkeleton key={i} />
      ))}
    </ul>
  );
}

/* ── Booking row skeleton ────────────────────────────────────────── */
export function BookingRowSkeleton() {
  return (
    <li className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-1 flex-col gap-2">
        <Pulse className="h-4 w-1/3" />
        <Pulse className="h-3 w-1/2" />
      </div>
      <Pulse className="h-6 w-20 rounded-full" />
    </li>
  );
}

export function BookingRowSkeletonList({ count = 3 }: { count?: number }) {
  return (
    <ul className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <BookingRowSkeleton key={i} />
      ))}
    </ul>
  );
}

/* ── Message thread skeleton ─────────────────────────────────────── */
export function ThreadSkeleton() {
  return (
    <li className="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4">
      <Pulse className="h-10 w-10 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Pulse className="h-4 w-1/3" />
        <Pulse className="h-3 w-2/3" />
      </div>
      <Pulse className="h-3 w-10" />
    </li>
  );
}

export function ThreadSkeletonList({ count = 4 }: { count?: number }) {
  return (
    <ul className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <ThreadSkeleton key={i} />
      ))}
    </ul>
  );
}

/* ── Stats strip skeleton ────────────────────────────────────────── */
export function StatChipSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-wrap gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex min-w-[7rem] flex-col gap-2 rounded-2xl border border-border bg-card px-5 py-3"
        >
          <Pulse className="h-2.5 w-16" />
          <Pulse className="h-5 w-10" />
        </div>
      ))}
    </div>
  );
}
