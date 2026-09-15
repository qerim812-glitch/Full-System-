import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  checkInToVenue,
  checkOutFromVenue,
  fetchVenueSocialFeed,
  type PresenceEntry,
} from "../../lib/social";
import { formatBookingDate } from "../../lib/utils";
import { Avatar } from "../Avatar";
import { pillClass, primaryPillClass } from "../PageChrome";

/** "Who's going" — connections' check-ins for a venue on a date + my own. */
export function SocialFeedPanel({
  venueSlug,
  date,
  myCheckin,
}: {
  venueSlug: string;
  date: string;
  /** From the loader, for `date` on first render; null when not checked in. */
  myCheckin: { note: string | null } | null;
}) {
  const router = useRouter();
  const [feed, setFeed] = useState<PresenceEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [mine, setMine] = useState<{ note: string | null } | null>(myCheckin);

  useEffect(() => {
    setMine(myCheckin);
  }, [myCheckin, date]);

  async function loadFeed() {
    try {
      setFeed(await fetchVenueSocialFeed({ data: { venueSlug, date } }));
    } catch {
      setFeed([]);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchVenueSocialFeed({ data: { venueSlug, date } })
      .then((rows) => {
        if (!cancelled) setFeed(rows);
      })
      .catch(() => {
        if (!cancelled) setFeed([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [venueSlug, date]);

  async function handleCheckIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await checkInToVenue({
        data: { venueSlug, date, note: note.trim() || undefined },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setMine({ note: note.trim() || null });
      setNote("");
      toast.success("Your connections can see you're going.");
      await loadFeed();
      await router.invalidate();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckOut() {
    setBusy(true);
    try {
      const result = await checkOutFromVenue({ data: { venueSlug, date } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setMine(null);
      await loadFeed();
      await router.invalidate();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {mine ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent bg-accent/10 px-5 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              You're going on {formatBookingDate(date)}
            </p>
            {mine.note ? (
              <p className="text-xs text-muted-foreground">{mine.note}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void handleCheckOut()}
            disabled={busy}
            className={pillClass("text-xs", { danger: true })}
          >
            Remove
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleCheckIn}
          className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm"
        >
          <div className="flex min-w-[180px] flex-1 flex-col gap-1">
            <label
              htmlFor={`checkin-note-${venueSlug}`}
              className="text-xs font-medium text-muted-foreground"
            >
              Tell your connections you're going on {formatBookingDate(date)}
            </label>
            <input
              id={`checkin-note-${venueSlug}`}
              type="text"
              maxLength={280}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note, e.g. arriving at 21:00"
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button type="submit" disabled={busy} className={primaryPillClass()}>
            {busy ? "Saving…" : "I'm going"}
          </button>
        </form>
      )}

      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Connections going on {formatBookingDate(date)}
        </h3>
        {loading ? (
          <div className="flex flex-col gap-2" aria-busy>
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-2xl bg-muted"
              />
            ))}
          </div>
        ) : !feed || feed.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              None of your connections have said they're going here on this
              date.
            </p>
            <Link to="/people" className={pillClass("mt-3 text-xs")}>
              Find connections
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {feed.map((entry) => (
              <li
                key={entry.user_id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm"
              >
                <Avatar
                  name={entry.display_name}
                  url={entry.avatar_url}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    to="/people/$userId"
                    params={{ userId: entry.user_id }}
                    className="text-sm font-semibold text-foreground hover:underline"
                  >
                    {entry.display_name ?? "Member"}
                  </Link>
                  {entry.note ? (
                    <p className="text-xs text-muted-foreground">
                      {entry.note}
                    </p>
                  ) : null}
                </div>
                <Link
                  to="/messages/$userId"
                  params={{ userId: entry.user_id }}
                  className={pillClass("shrink-0 text-xs")}
                >
                  Message
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
