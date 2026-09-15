import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Avatar } from "../../components/Avatar";
import { ConfirmButton } from "../../components/ConfirmButton";
import { EmptyState } from "../../components/EmptyState";
import {
  PageHeader,
  RouteError,
  SearchInput,
  pillClass,
  primaryPillClass,
} from "../../components/PageChrome";
import { PillTabs, tabPanelProps } from "../../components/PillTabs";
import { StatChipSkeleton } from "../../components/Skeletons";
import { StatChip } from "../../components/StatChip";
import { searchPeople, type PublicProfile } from "../../lib/people";
import { pageHead } from "../../lib/seo";
import {
  checkInToVenue,
  checkOutFromVenue,
  fetchMyCheckins,
  fetchMyConnections,
  fetchPendingRequests,
  fetchSentRequests,
  removeConnection,
  respondToRequest,
  sendConnectionRequest,
  type Connection,
  type PendingRequest,
} from "../../lib/social";
import { formatBookingDate, formatDate, todayInTirana } from "../../lib/utils";
import { fetchVenues } from "../../lib/venues";

type Tab = "connections" | "requests" | "going" | "discover";

export const Route = createFileRoute("/_authed/people")({
  loader: async () => {
    const [connections, pending, sent, checkins, venues] = await Promise.all([
      fetchMyConnections(),
      fetchPendingRequests(),
      fetchSentRequests(),
      fetchMyCheckins(),
      fetchVenues(),
    ]);
    return { connections, pending, sent, checkins, venues };
  },
  head: () =>
    pageHead("People", "Connect with members going to the same venues."),
  pendingComponent: PeopleSkeleton,
  errorComponent: () => <RouteError title="Could not load People" />,
  component: PeoplePage,
});

function PeopleSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy>
      <div className="h-8 w-36 animate-pulse rounded-lg bg-muted" />
      <StatChipSkeleton count={3} />
      <div className="h-10 w-64 animate-pulse rounded-full bg-muted" />
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  );
}

type Result = { ok: boolean; error?: string };

function PeoplePage() {
  const { connections, pending, sent, checkins, venues } =
    Route.useLoaderData();
  const router = useRouter();
  const tabsId = useId();

  const [tab, setTab] = useState<Tab>(
    pending.length > 0 ? "requests" : "connections",
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicProfile[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [checkInVenue, setCheckInVenue] = useState("");
  const [checkInDate, setCheckInDate] = useState(todayInTirana());
  const [checkInNote, setCheckInNote] = useState("");
  const [checkInBusy, setCheckInBusy] = useState(false);

  const venueMap = new Map(venues.map((v) => [v.slug, v]));
  const connectedIds = new Set(connections.map((c) => c.user_id));
  const incomingIds = new Set(pending.map((p) => p.requester_id));
  const sentIds = new Set(sent.map((s) => s.addressee_id));

  async function run(id: string, fn: () => Promise<Result>, okMsg?: string) {
    setBusyId(id);
    try {
      const result = await fn();
      if (!result.ok) toast.error(result.error ?? "Something went wrong.");
      else {
        if (okMsg) toast.success(okMsg);
        await router.invalidate();
      }
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      setResults(await searchPeople({ data: { query: query.trim() } }));
    } catch {
      toast.error("Search failed. Try again.");
    } finally {
      setSearching(false);
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
        toast.success("Saved. Your connections can see you're going.");
        setCheckInNote("");
        await router.invalidate();
      }
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setCheckInBusy(false);
    }
  }

  const tabs = [
    {
      id: "connections" as const,
      label: "Connections",
      badge: connections.length,
    },
    { id: "requests" as const, label: "Requests", badge: pending.length },
    { id: "going" as const, label: "Going out", badge: checkins.length },
    { id: "discover" as const, label: "Discover" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="People"
        subtitle="Connect with others going to the same venues."
      />

      <div className="flex flex-wrap gap-4">
        <StatChip
          label="Connections"
          value={String(connections.length)}
          accent={connections.length > 0}
        />
        <StatChip
          label="Requests"
          value={String(pending.length)}
          accent={pending.length > 0}
        />
        <StatChip label="Going out" value={String(checkins.length)} />
      </div>

      <PillTabs
        tabs={tabs}
        value={tab}
        onChange={setTab}
        label="People sections"
      />

      {tab === "connections" ? (
        <section
          {...tabPanelProps(tabsId, "connections")}
          className="flex flex-col gap-3"
        >
          {connections.length === 0 ? (
            <EmptyState
              title="No connections yet"
              body="Go to Discover to find people and send connection requests."
              action={
                <button
                  type="button"
                  onClick={() => setTab("discover")}
                  className={primaryPillClass()}
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
                  busy={busyId === conn.connection_id}
                  onRemove={() =>
                    run(
                      conn.connection_id,
                      () =>
                        removeConnection({
                          data: { connectionId: conn.connection_id },
                        }),
                      "Connection removed.",
                    )
                  }
                />
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === "requests" ? (
        <section
          {...tabPanelProps(tabsId, "requests")}
          className="flex flex-col gap-6"
        >
          {pending.length === 0 ? (
            <EmptyState
              title="No pending requests"
              body="When someone wants to connect with you, their request appears here."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {pending.map((req) => (
                <RequestRow
                  key={req.connection_id}
                  request={req}
                  busy={busyId === req.connection_id}
                  onRespond={(accept) =>
                    run(
                      req.connection_id,
                      () =>
                        respondToRequest({
                          data: { connectionId: req.connection_id, accept },
                        }),
                      accept ? "Connected!" : "Request declined.",
                    )
                  }
                />
              ))}
            </ul>
          )}

          {sent.length > 0 ? (
            <div className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Sent by you
              </h2>
              <ul className="flex flex-col gap-2">
                {sent.map((s) => (
                  <li
                    key={s.connection_id}
                    className="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-3 shadow-sm"
                  >
                    <Avatar
                      name={s.display_name}
                      url={s.avatar_url}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/people/$userId"
                        params={{ userId: s.addressee_id }}
                        className="text-sm font-semibold text-foreground hover:underline"
                      >
                        {s.display_name?.trim() || "Member"}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        Requested {formatDate(s.requested_at)} · awaiting reply
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busyId === s.connection_id}
                      onClick={() =>
                        run(
                          s.connection_id,
                          () =>
                            removeConnection({
                              data: { connectionId: s.connection_id },
                            }),
                          "Request withdrawn.",
                        )
                      }
                      className={pillClass("text-xs")}
                    >
                      Withdraw
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === "going" ? (
        <section
          {...tabPanelProps(tabsId, "going")}
          className="flex flex-col gap-6"
        >
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-1 text-base font-semibold text-foreground">
              Announce you're going out
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Let your connections know where you'll be. They'll see it in the
              venue's "Who's going" tab.
            </p>
            <form onSubmit={handleCheckIn} className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="checkin-venue"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Venue
                  </label>
                  <select
                    id="checkin-venue"
                    required
                    value={checkInVenue}
                    onChange={(e) => setCheckInVenue(e.target.value)}
                    className="h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Choose a venue…</option>
                    {venues.map((v) => (
                      <option key={v.slug} value={v.slug}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="checkin-date"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Date
                  </label>
                  <input
                    id="checkin-date"
                    type="date"
                    required
                    min={todayInTirana()}
                    value={checkInDate}
                    onChange={(e) => setCheckInDate(e.target.value)}
                    className="h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="checkin-note"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Note{" "}
                  <span className="text-muted-foreground/60">(optional)</span>
                </label>
                <input
                  id="checkin-note"
                  type="text"
                  maxLength={280}
                  value={checkInNote}
                  onChange={(e) => setCheckInNote(e.target.value)}
                  placeholder="Arriving around 21:00…"
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <button
                type="submit"
                disabled={checkInBusy || !checkInVenue}
                className={primaryPillClass("w-fit")}
              >
                {checkInBusy ? "Saving…" : "Let connections know"}
              </button>
            </form>
          </div>

          {checkins.length === 0 ? (
            <EmptyState
              title="No upcoming plans"
              body="Use the form above to announce where you're going. Your connections will see it."
            />
          ) : (
            <div className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Your upcoming plans
              </h2>
              <ul className="flex flex-col gap-2">
                {checkins.map((ci) => {
                  const venue = venueMap.get(ci.venue_slug);
                  const imgUrl =
                    ci.venues?.image_url ?? venue?.image_url ?? null;
                  const name = ci.venues?.name ?? venue?.name ?? ci.venue_slug;
                  const key = `${ci.venue_slug}-${ci.checkin_date}`;
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
                        <Link
                          to="/venues/$slug"
                          params={{ slug: ci.venue_slug }}
                          className="text-sm font-semibold text-foreground hover:underline"
                        >
                          {name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {formatBookingDate(ci.checkin_date)}
                          {ci.note ? ` · ${ci.note}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          run(key, () =>
                            checkOutFromVenue({
                              data: {
                                venueSlug: ci.venue_slug,
                                date: ci.checkin_date,
                              },
                            }),
                          )
                        }
                        disabled={busyId === key}
                        className={pillClass("shrink-0 text-xs", {
                          danger: true,
                        })}
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
      ) : null}

      {tab === "discover" ? (
        <section
          {...tabPanelProps(tabsId, "discover")}
          className="flex flex-col gap-5"
        >
          <form
            onSubmit={handleSearch}
            className="flex flex-wrap items-center gap-3"
          >
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search by name…"
              label="Search people"
            />
            <button
              type="submit"
              disabled={searching || query.trim().length < 2}
              className={primaryPillClass()}
            >
              {searching ? "Searching…" : "Search"}
            </button>
          </form>

          {results !== null ? (
            <div className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {results.length === 0
                  ? `No results for "${query.trim()}"`
                  : `${results.length} result${results.length !== 1 ? "s" : ""} for "${query.trim()}"`}
              </h2>
              <ul className="flex flex-col gap-2">
                {results.map((person) => {
                  const state = connectedIds.has(person.id)
                    ? "connected"
                    : incomingIds.has(person.id)
                      ? "incoming"
                      : sentIds.has(person.id)
                        ? "sent"
                        : "none";
                  return (
                    <li
                      key={person.id}
                      className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm"
                    >
                      <Avatar
                        name={person.display_name}
                        url={person.avatar_url}
                      />
                      <div className="min-w-0 flex-1">
                        <Link
                          to="/people/$userId"
                          params={{ userId: person.id }}
                          className="text-sm font-semibold text-foreground hover:underline"
                        >
                          {person.display_name?.trim() || "Member"}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {state === "connected"
                            ? "Connected"
                            : state === "incoming"
                              ? "Wants to connect with you"
                              : state === "sent"
                                ? "Request sent"
                                : "Not connected"}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Link
                          to="/messages/$userId"
                          params={{ userId: person.id }}
                          className={pillClass("text-xs")}
                        >
                          Message
                        </Link>
                        {state === "none" ? (
                          <button
                            type="button"
                            onClick={() =>
                              run(
                                person.id,
                                () =>
                                  sendConnectionRequest({
                                    data: { userId: person.id },
                                  }),
                                "Connection request sent.",
                              )
                            }
                            disabled={busyId === person.id}
                            className={primaryPillClass("text-xs")}
                          >
                            {busyId === person.id ? "…" : "Connect"}
                          </button>
                        ) : state === "incoming" ? (
                          <button
                            type="button"
                            onClick={() => setTab("requests")}
                            className={primaryPillClass("text-xs")}
                          >
                            Respond
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <EmptyState
              title="Find people"
              body="Search by name to find other members and send connection requests."
            />
          )}
        </section>
      ) : null}
    </div>
  );
}

function ConnectionRow({
  connection,
  busy,
  onRemove,
}: {
  connection: Connection;
  busy: boolean;
  onRemove: () => void;
}) {
  const name = connection.display_name?.trim() || "Member";
  return (
    <li className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
      <Avatar name={name} url={connection.avatar_url} />
      <div className="min-w-0 flex-1">
        <Link
          to="/people/$userId"
          params={{ userId: connection.user_id }}
          className="text-sm font-semibold text-foreground hover:underline"
        >
          {name}
        </Link>
        <p className="text-xs text-muted-foreground">
          Connected {formatDate(connection.connected_at)}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Link
          to="/messages/$userId"
          params={{ userId: connection.user_id }}
          className={pillClass("text-xs")}
        >
          Message
        </Link>
        <ConfirmButton
          title={`Remove ${name}?`}
          description="You will stop seeing each other's plans. You can send a new request later."
          confirmLabel="Remove"
          onConfirm={onRemove}
          disabled={busy}
          className={pillClass("text-xs", { danger: true })}
        >
          {busy ? "…" : "Remove"}
        </ConfirmButton>
      </div>
    </li>
  );
}

function RequestRow({
  request,
  busy,
  onRespond,
}: {
  request: PendingRequest;
  busy: boolean;
  onRespond: (accept: boolean) => void;
}) {
  const name = request.display_name?.trim() || "Member";
  return (
    <li className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
      <Avatar name={name} url={request.avatar_url} />
      <div className="min-w-0 flex-1">
        <Link
          to="/people/$userId"
          params={{ userId: request.requester_id }}
          className="text-sm font-semibold text-foreground hover:underline"
        >
          {name}
        </Link>
        <p className="text-xs text-muted-foreground">
          Wants to connect · {formatDate(request.requested_at)}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => onRespond(true)}
          disabled={busy}
          className={primaryPillClass("text-xs")}
        >
          {busy ? "…" : "Accept"}
        </button>
        <button
          type="button"
          onClick={() => onRespond(false)}
          disabled={busy}
          className={pillClass("text-xs", { danger: true })}
        >
          Decline
        </button>
      </div>
    </li>
  );
}
