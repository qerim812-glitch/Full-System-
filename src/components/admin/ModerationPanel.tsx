import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  fetchModerationFeed,
  setContentHidden,
  type AdminVenue,
  type ModerationItem,
} from "../../lib/admin";
import { formatDateTime } from "../../lib/utils";
import { pillClass } from "../PageChrome";
import { EmptyCard } from "./EmptyCard";

export function ModerationPanel({ venues }: { venues: AdminVenue[] }) {
  const [venueSlug, setVenueSlug] = useState<string>("");
  const [items, setItems] = useState<ModerationItem[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showHiddenOnly, setShowHiddenOnly] = useState(false);

  async function load(slug: string) {
    try {
      setItems(
        await fetchModerationFeed({ data: slug ? { venueSlug: slug } : {} }),
      );
    } catch {
      toast.error("Could not load content.");
      setItems([]);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    fetchModerationFeed({ data: venueSlug ? { venueSlug } : {} })
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [venueSlug]);

  async function toggle(item: ModerationItem) {
    setBusyId(item.id);
    try {
      const result = await setContentHidden({
        data: { kind: item.kind, id: item.id, hidden: !item.is_hidden },
      });
      if (!result.ok) toast.error(result.error);
      else toast.success(item.is_hidden ? "Restored" : "Hidden from members");
      await load(venueSlug);
    } finally {
      setBusyId(null);
    }
  }

  const visible = (items ?? []).filter((i) => !showHiddenOnly || i.is_hidden);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Venue
          <select
            value={venueSlug}
            onChange={(e) => setVenueSlug(e.target.value)}
            className="h-10 rounded-full border border-border bg-card px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All venues</option>
            {venues.map((v) => (
              <option key={v.slug} value={v.slug}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showHiddenOnly}
            onChange={(e) => setShowHiddenOnly(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Hidden only
        </label>
        <span className="text-xs text-muted-foreground">
          {items ? `${visible.length} items` : "Loading…"}
        </span>
      </div>

      {items === null ? (
        <div className="flex flex-col gap-2" aria-busy>
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyCard text="Nothing to moderate here." />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((item) => (
            <li
              key={`${item.kind}-${item.id}`}
              className={`flex flex-wrap items-start gap-4 rounded-2xl border bg-card px-5 py-4 shadow-sm ${
                item.is_hidden ? "border-destructive/30" : "border-border"
              }`}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-muted px-2 py-0.5 font-semibold capitalize">
                    {item.kind === "review"
                      ? `Review · ${item.rating}/5`
                      : "Chat"}
                  </span>
                  <span>{item.venue_name ?? item.venue_slug}</span>
                  <span>·</span>
                  <span>
                    {item.author_name ?? item.author_email ?? "unknown"}
                  </span>
                  <span>·</span>
                  <time dateTime={item.created_at}>
                    {formatDateTime(item.created_at)}
                  </time>
                  {item.is_hidden ? (
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-semibold text-destructive">
                      Hidden
                    </span>
                  ) : null}
                </div>
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {item.body ?? (
                    <span className="italic text-muted-foreground">
                      (no text)
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                disabled={busyId === item.id}
                onClick={() => void toggle(item)}
                className={pillClass("gap-1.5 text-xs", {
                  danger: !item.is_hidden,
                })}
              >
                {item.is_hidden ? (
                  <>
                    <Eye className="h-3.5 w-3.5" aria-hidden /> Restore
                  </>
                ) : (
                  <>
                    <EyeOff className="h-3.5 w-3.5" aria-hidden /> Hide
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Members
   ══════════════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════════════
   Audit log
   ══════════════════════════════════════════════════════════════════════════ */
