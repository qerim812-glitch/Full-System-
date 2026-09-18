import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  exportBookingsCsv,
  fetchAdminBookings,
  setBookingStatus,
  type AdminBooking,
} from "../../lib/admin";
import { SearchInput, pillClass, primaryPillClass } from "../PageChrome";
import { ConfirmButton } from "../ConfirmButton";
import { formatBookingDate, formatSlot } from "../../lib/utils";
import { EmptyCard } from "./EmptyCard";
import { ExportButton } from "./ExportButton";
import type { Runner } from "./AdminShared";

const STATUS_STYLES: Record<AdminBooking["status"], string> = {
  confirmed: "bg-accent text-accent-foreground",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

/* ══════════════════════════════════════════════════════════════════════════
   Bookings — list, status management, CSV export
   ══════════════════════════════════════════════════════════════════════════ */
export function BookingsPanel({
  initialBookings,
  busyId,
  run,
}: {
  initialBookings: AdminBooking[];
  busyId: string | null;
  run: Runner;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [bookings, setBookings] = useState(initialBookings);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 50;

  useEffect(() => {
    setBookings(initialBookings);
    setPage(0);
  }, [initialBookings]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await fetchAdminBookings({ data: { page: page + 1 } });
      setPage((p) => p + 1);
      setBookings((prev) => [...prev, ...next]);
    } catch {
      toast.error("Could not load more bookings.");
    } finally {
      setLoadingMore(false);
    }
  }

  const term = search.trim().toLowerCase();
  const visible = term
    ? bookings.filter(
        (b) =>
          b.venue_name?.toLowerCase().includes(term) ||
          b.user_name?.toLowerCase().includes(term) ||
          b.user_email?.toLowerCase().includes(term),
      )
    : bookings;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Filter by venue, name or email…"
          label="Filter bookings"
          className="sm:w-72"
        />
        <span className="text-xs text-muted-foreground">
          {visible.length} bookings
        </span>
        <span className="ml-auto">
          <ExportButton
            label="Export CSV"
            filename="bookings"
            fetchCsv={exportBookingsCsv}
          />
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyCard text="No bookings found." />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((b) => (
            <li
              key={b.id}
              className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-sm font-semibold text-foreground">
                  {b.venue_name ?? b.venue_slug}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatBookingDate(b.booking_date)} at{" "}
                  {formatSlot(b.booking_time)} · {b.party_size}{" "}
                  {b.party_size === 1 ? "person" : "people"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {b.user_name ?? "(no name)"} · {b.user_email ?? "no email"}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLES[b.status]}`}
              >
                {b.status}
              </span>
              <div className="flex gap-2">
                {b.status !== "completed" ? (
                  <button
                    type="button"
                    disabled={busyId === b.id}
                    onClick={() =>
                      run(
                        b.id,
                        () =>
                          setBookingStatus({
                            data: { id: b.id, status: "completed" },
                          }),
                        "Booking marked completed",
                      )
                    }
                    className={primaryPillClass("text-xs")}
                  >
                    Complete
                  </button>
                ) : null}
                {b.status === "confirmed" ? (
                  <ConfirmButton
                    title="Cancel this booking?"
                    description={`${b.user_name ?? b.user_email ?? "The member"} will be notified that their table at ${b.venue_name ?? b.venue_slug} was cancelled.`}
                    confirmLabel="Cancel booking"
                    cancelLabel="Keep"
                    onConfirm={() =>
                      run(
                        b.id,
                        () =>
                          setBookingStatus({
                            data: { id: b.id, status: "cancelled" },
                          }),
                        "Booking cancelled",
                      )
                    }
                    disabled={busyId === b.id}
                    className={pillClass("text-xs", { danger: true })}
                  >
                    Cancel
                  </ConfirmButton>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {bookings.length === (page + 1) * PAGE_SIZE ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className={pillClass()}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Venues — list, add/edit form, branches
   ══════════════════════════════════════════════════════════════════════════ */
