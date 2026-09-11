import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { fetchDmThreads } from "../../lib/messaging";
import { searchPeople, type PublicProfile } from "../../lib/people";

export const Route = createFileRoute("/_authed/messages")({
  loader: async () => ({ threads: await fetchDmThreads() }),
  component: MessagesPage,
});

function MessagesPage() {
  const { threads } = Route.useLoaderData();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicProfile[] | null>(null);
  const [searching, setSearching] = useState(false);

  const totalUnread = threads.reduce((s, t) => s + t.unread, 0);

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    setSearching(true);
    try {
      setResults(await searchPeople({ data: { query: trimmed } }));
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Messages
        </h1>
        <p className="text-sm text-muted-foreground">
          Private conversations. Blocked people never appear here.
        </p>
      </div>

      {/* ── Stats strip ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4">
        <StatChip label="Conversations" value={String(threads.length)} />
        <StatChip label="Unread" value={String(totalUnread)} accent={totalUnread > 0} />
      </div>

      {/* ── Pill search ─────────────────────────────────────────── */}
      <form onSubmit={handleSearch} className="flex items-center gap-3">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find someone by name…"
            aria-label="Search members"
            className="h-9 w-56 rounded-full border border-border bg-card pl-9 pr-4 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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

      {/* ── Search results ──────────────────────────────────────── */}
      {results !== null && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Results for "{query.trim()}"
          </h2>
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nobody matches that name.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {results.map((person) => (
                <li key={person.id}>
                  <Link
                    to="/messages/$userId"
                    params={{ userId: person.id }}
                    className="flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-3 shadow-sm transition-all hover:border-foreground/20"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                        {((person.display_name?.trim() ?? "M")[0] ?? "M").toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        {person.display_name?.trim() || "Member"}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">Message →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── Thread list ─────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Conversations
        </h2>
        {threads.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
            <p className="text-sm text-muted-foreground">
              No conversations yet. Search for someone above to start one.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {threads.map((thread) => (
              <li key={thread.other.id}>
                <Link
                  to="/messages/$userId"
                  params={{ userId: thread.other.id }}
                  className="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm transition-all hover:border-foreground/20"
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                      {((thread.other_name ?? "M")[0] ?? "M").toUpperCase()}
                    </div>
                    {thread.unread > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                        {thread.unread}
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {thread.other_name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {thread.last_body}
                    </p>
                  </div>

                  {/* Time */}
                  <time
                    dateTime={thread.last_at}
                    className="shrink-0 text-[11px] text-muted-foreground"
                  >
                    {new Date(thread.last_at).toLocaleDateString()}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
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
      <span className="text-xl font-semibold leading-none text-foreground">{value}</span>
    </div>
  );
}
