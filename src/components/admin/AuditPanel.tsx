import { useEffect, useState } from "react";
import { toast } from "sonner";

import { fetchAuditLog, type AuditEntry } from "../../lib/admin";
import { formatDateTime } from "../../lib/utils";
import { pillClass } from "../PageChrome";
import { EmptyCard } from "./EmptyCard";

const ACTION_COLOURS: Record<string, string> = {
  "report.actioned": "bg-destructive/10 text-destructive",
  "report.dismissed": "bg-muted text-muted-foreground",
  "donation.confirmed": "bg-accent text-accent-foreground",
  "donation.failed": "bg-destructive/10 text-destructive",
  "user.suspend": "bg-destructive/10 text-destructive",
  "user.unsuspend": "bg-accent text-accent-foreground",
  "venue.activate": "bg-accent text-accent-foreground",
  "venue.deactivate": "bg-muted text-muted-foreground",
  "booking.cancelled": "bg-destructive/10 text-destructive",
  "booking.completed": "bg-accent text-accent-foreground",
  "review.hide": "bg-destructive/10 text-destructive",
  "chat.hide": "bg-destructive/10 text-destructive",
};

export function AuditPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 50;

  useEffect(() => {
    let cancelled = false;
    fetchAuditLog({ data: { page: 0 } })
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load audit log.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await fetchAuditLog({ data: { page: page + 1 } });
      setPage((p) => p + 1);
      setEntries((prev) => [...prev, ...next]);
    } catch {
      toast.error("Could not load more entries.");
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2" aria-busy>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Append-only log of every admin action. Records cannot be edited or
        deleted.
      </p>

      {entries.length === 0 ? (
        <EmptyCard text="No audit entries yet." />
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card px-5 py-3 shadow-sm"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ACTION_COLOURS[entry.action] ?? "bg-muted text-muted-foreground"}`}
                  >
                    {entry.action}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {entry.target_type}/{entry.target_id.slice(0, 8)}…
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  by {entry.actor_name ?? `${entry.actor_id.slice(0, 8)}…`}
                  {entry.detail !== "{}" ? ` · ${entry.detail}` : ""}
                </p>
              </div>
              <time
                dateTime={entry.created_at}
                className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
              >
                {formatDateTime(entry.created_at)}
              </time>
            </li>
          ))}
        </ul>
      )}

      {entries.length === (page + 1) * PAGE_SIZE ? (
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

/* ── Shared helpers ────────────────────────────────────────────────────── */
