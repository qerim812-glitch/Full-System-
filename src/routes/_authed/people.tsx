import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
  fetchMyCheckins,
  fetchMyConnections,
  fetchPendingRequests,
  respondToRequest,
  sendConnectionRequest,
  checkInToVenue,
  checkOutFromVenue,
  removeConnection,
  type Connection,
  type PendingRequest,
} from "../../lib/social";
import { fetchVenues, type Venue } from "../../lib/venues";
import { searchPeople, type PublicProfile } from "../../lib/people";
import { todayInTirana } from "../../lib/utils";

export const Route = createFileRoute("/_authed/people")({
  loader: async () => {
    const [connections, pending, checkins, venues] = await Promise.all([
      fetchMyConnections(),
      fetchPendingRequests(),
      fetchMyCheckins(),
      fetchVenues(),
    ]);
    return { connections, pending, checkins, venues };
  },
  pendingComponent: PeopleSkeleton,
  errorComponent: () => (
    <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      <h2 className="text-base font-semibold text-foreground">
        Could not load People
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Refresh the page to try again.
      </p>
    </div>
  ),
  component: PeoplePage,
});

function PeopleSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="h-8 w-36 animate-pulse rounded-lg bg-muted" />
      <div className="flex gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 w-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-12 w-64 animate-pulse rounded-full bg-muted" />
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  );
}

function PeoplePage() {
  const { connections, pending, checkins, venues } = Route.useLoaderData();
  const router = useRouter();

  const [tab, setTab] = useState<"connections" | "requests" | "discover" | "going">(
    pending.length > 0 ? "requests" : "connections",
  );

  // Discover — search
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicProfile[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Going tonight — check-in
  const [checkInVenue, setCheckInVenue] = useState("");
  const [checkInDate, setCheckInDate] = useState(todayInTirana());
  const [checkInNote, setCheckInNote] = useState("");
  const [checkInBusy, setCheckInBusy] = useState(false);

  const venueMap = new Map(venues.map((v) => [v.slug, v]));

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      setResults(await searchPeople({ data: { query: query.trim() } }));
    } finally {
      setSearching(false);
    }
  }

  async function handleConnect(userId: string) {
    setBusyId(userId);
    try {
      const result = await sendConnectionRequest({ data: { userId } });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success("Connection request sent!");
        await router.invalidate();
      }
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRespond(connectionId: string, accept: boolean) {
    setBusyId(connectionId);
    try {
      const result = await respondToRequest({ data: { connectionId, accept } });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(accept ? "Connected!" : "Request declined.");
        await router.invalidate();
      }
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(connectionId: string) {
    setBusyId(connectionId);
    try {
      const result = await removeConnection({ data: { connectionId } });
      if (!result.ok) toast.error(result.error);
      else await router.invalidate();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCheckIn(e: React.FormEvent) {
    e.preventDefault();
    if (!checkInVenue) return;
    setCheckInBusy(true);
    try {
      const result = await checkInToVenue({
        data: {
          venueSlug: checkInVenue,
          date: checkInDate,
          note: checkInNote.trim() || undefined,
        },
      });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success("Check-in saved! Your connections can see you're going.");
        setCheckInNote("");
        await router.invalidate();
      }
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setCheckInBusy(false);
    }
  }

  async function handleCheckOut(venueSlug: string, date: string) {
    setBusyId(`${venueSlug}-${date}`);
    try {
      const result = await checkOutFromVenue({ data: { venueSlug, date } });
      if (!result.ok) toast.error(result.error);
      else await router.invalidate();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusyId(null);
    }
  }

  const TABS = [
    { id: "connections" as const, label: "Connections", badge: connections.length },
    { id: "requests" as const, label: "Requests", badge: pending.length },
    { id: "going" as const, label: "Going out", badge: checkins.length },
    { id: "discover" as const, label: "Discover" },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          People
        </h1>
        <p className="text-sm text-muted-foreground">
          Connect with others going to the same venues.
        </p>
      </div>

      {/* ── Stats strip ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4">
        <StatChip label="Connections" value={String(connections.length)} accent={connections.length > 0} />
        <StatChip label="Pending" value={String(pending.length)} accent={pending.length > 0} />
        <StatChip label="Going out" value={String(checkins.length)} />
      </div>

      {/* ── Tab pills ────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-foreground">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Connections tab ──────────────────────────────────────── */}
      {tab === "connections" && (
        <section className="flex flex-col gap-3">
          {connections.length === 0 ? (
            <EmptyCard
              title="No connections yet"
              body="Go to Discover to find people and send connection requests."
              action={
                <button
                  onClick={() => setTab("discover")}
                  className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Discover people
                </button>
              }
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {connections.map((conn) => (
                <ConnectionRow
                  key={conn.connection_id}
                  connection={conn}
                  busyId={busyId}
                  onRemove={handleRemove}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── Requests tab ─────────────────────────────────────────── */}
      {tab === "requests" && (
        <section className="flex flex-col gap-3">
          {pending.length === 0 ? (
            <EmptyCard
              title="No pending requests"
              body="When someone wants to connect with you, their request appears here."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {pending.map((req) => (
                <RequestRow
                  key={req.connection_id}
                  request={req}
                  busyId={busyId}
                  onRespond={handleRespond}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── Going out tab ────────────────────────────────────────── */}
      {tab === "going" && (
        <section className="flex flex-col gap-6">
          {/* Add check-in form */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-1 text-base font-semibold text-foreground">
              Announce you're going out
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Let your connections know where you'll be. They'll see this in
              the venue's social feed.
            </p>
            <form onSubmit={handleCheckIn} className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Venue
                  </label>
                  <select
                    required
                    value={checkInVenue}
                    onChange={(e) => setCheckInVenue(e.target.value)}
                    className="h-9 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Choose a venue…</option>
                    {venues.map((v) => (
                      <option key={v.slug} value={v.slug}>{v.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    min={todayInTirana()}
                    value={checkInDate}
                    onChange={(e) => setCheckInDate(e.target.value)}
                    className="h-9 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Note <span className="text-muted-foreground/60">(optional)</span>
                </label>
                <input
                  type="text"
                  maxLength={280}
                  value={checkInNote}
                  onChange={(e) => setCheckInNote(e.target.value)}
                  placeholder="Arriving around 21:00…"
                  className="h-9 rounded-xl border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <button
                type="submit"
                disabled={checkInBusy || !checkInVenue}
                className="w-fit rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {checkInBusy ? "Saving…" : "Let connections know"}
              </button>
            </form>
          </div>

          {/* My upcoming check-ins */}
          {checkins.length === 0 ? (
            <EmptyCard
              title="No upcoming plans"
              body="Use the form above to announce where you're going. Your connections will see it."
            />
          ) : (
            <div className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Your upcoming plans
              </h2>
              <ul className="flex flex-col gap-2">
                {(checkins as Array<{
                  id: string;
                  venue_slug: string;
                  checkin_date: string;
                  note: string | null;
                  venues: { name: string; image_url: string | null } | null;
                }>).map((ci) => {
                  const venue = venueMap.get(ci.venue_slug);
                  const imgUrl = (ci.venues as { image_url: string | null } | null)?.image_url ?? venue?.image_url ?? null;
                  const name = (ci.venues as { name: string } | null)?.name ?? venue?.name ?? ci.venue_slug;
                  return (
                    <li
                      key={ci.id}
                      className="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm"
                    >
                      {imgUrl ? (
                        <img
                          src={imgUrl}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 shrink-0 rounded-xl bg-muted" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">
                          {name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {ci.checkin_date}
                          {ci.note ? ` · ${ci.note}` : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => void handleCheckOut(ci.venue_slug, ci.checkin_date)}
                        disabled={busyId === `${ci.venue_slug}-${ci.checkin_date}`}
                        className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ── Discover tab ─────────────────────────────────────────── */}
      {tab === "discover" && (
        <section className="flex flex-col gap-5">
          <form onSubmit={handleSearch} className="flex items-center gap-3">
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name…"
                aria-label="Search people"
                className="h-9 w-64 rounded-full border border-border bg-card pl-9 pr-4 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              type="submit"
              disabled={searching || query.trim().length < 2}
              className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {searching ? "Searching…" : "Search"}
            </button>
          </form>

          {results !== null && (
            <div className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {results.length === 0
                  ? `No results for "${query.trim()}"`
                  : `${results.length} result${results.length !== 1 ? "s" : ""} for "${query.trim()}"`}
              </h2>
              <ul className="flex flex-col gap-2">
                {results.map((person) => {
                  const isConnected = connections.some(
                    (c) => c.user_id === person.id,
                  );
                  const isPending = pending.some(
                    (p) => p.requester_id === person.id,
                  );
                  return (
                    <li
                      key={person.id}
                      className="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                        {(
                          (person.display_name?.trim() ?? "M")[0] ?? "M"
                        ).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">
                          {person.display_name?.trim() || "Member"}
                        </p>
                        {isConnected && (
                          <p className="text-xs text-muted-foreground">
                            Already connected
                          </p>
                        )}
                        {isPending && (
                          <p className="text-xs text-muted-foreground">
                            Request pending
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Link
                          to="/messages/$userId"
                          params={{ userId: person.id }}
                          className="rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-foreground/20 hover:text-foreground"
                        >
                          Message
                        </Link>
                        {!isConnected && !isPending && (
                          <button
                            onClick={() => void handleConnect(person.id)}
                            disabled={busyId === person.id}
                            className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                          >
                            {busyId === person.id ? "…" : "Connect"}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {results === null && (
            <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent">
                <svg
                  className="h-6 w-6 text-accent-foreground"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-foreground">
                Find people
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                Search by name to find others using NewPop and send connection requests.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/* ── Connection row ──────────────────────────────────────────────── */
function ConnectionRow({
  connection,
  busyId,
  onRemove,
}: {
  connection: Connection;
  busyId: string | null;
  onRemove: (id: string) => void;
}) {
  return (
    <li className="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
        {((connection.display_name?.trim() ?? "M")[0] ?? "M").toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          {connection.display_name?.trim() || "Member"}
        </p>
        <p className="text-xs text-muted-foreground">
          Connected {new Date(connection.connected_at).toLocaleDateString()}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Link
          to="/messages/$userId"
          params={{ userId: connection.user_id }}
          className="rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-foreground/20 hover:text-foreground"
        >
          Message
        </Link>
        <button
          onClick={() => onRemove(connection.connection_id)}
          disabled={busyId === connection.connection_id}
          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
        >
          {busyId === connection.connection_id ? "…" : "Remove"}
        </button>
      </div>
    </li>
  );
}

/* ── Pending request row ─────────────────────────────────────────── */
function RequestRow({
  request,
  busyId,
  onRespond,
}: {
  request: PendingRequest;
  busyId: string | null;
  onRespond: (id: string, accept: boolean) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
        {((request.display_name?.trim() ?? "M")[0] ?? "M").toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          {request.display_name?.trim() || "Member"}
        </p>
        <p className="text-xs text-muted-foreground">
          Wants to connect ·{" "}
          {new Date(request.requested_at).toLocaleDateString()}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          onClick={() => onRespond(request.connection_id, true)}
          disabled={busyId === request.connection_id}
          className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busyId === request.connection_id ? "…" : "Accept"}
        </button>
        <button
          onClick={() => onRespond(request.connection_id, false)}
          disabled={busyId === request.connection_id}
          className="rounded-full border border-border px-4 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
        >
          Decline
        </button>
      </div>
    </li>
  );
}

/* ── Shared helpers ──────────────────────────────────────────────── */
function EmptyCard({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function StatChip({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex min-w-[6rem] flex-col gap-0.5 rounded-2xl px-5 py-3 shadow-sm ${
        accent ? "bg-accent text-accent-foreground" : "border border-border bg-card"
      }`}
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold leading-none text-foreground">
        {value}
      </span>
    </div>
  );
}
