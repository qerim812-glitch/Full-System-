import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
  StatChipSkeleton,
  ThreadSkeletonList,
} from "../../components/Skeletons";
import { fetchDmThreads, markAllRead } from "../../lib/messaging";
import { fetchMyConnections } from "../../lib/social";
import { searchPeople, type PublicProfile } from "../../lib/people";

export const Route = createFileRoute("/_authed/messages")({
  loader: async () => {
    const [threads, connections] = await Promise.all([
      fetchDmThreads(),
      fetchMyConnections(),
    ]);
    return { threads, connections };
  },
  pendingComponent: MessagesSkeleton,
  errorComponent: () => (
    <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      <h2 className="text-base font-semibold text-foreground">
        Could not load messages
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Refresh the page to try again.
      </p>
    </div>
  ),
  component: MessagesPage,
});

function MessagesSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
      <StatChipSkeleton count={2} />
      <ThreadSkeletonList count={4} />
    </div>
  );
}

/** Format a timestamp: show time-only if today, otherwise short date. */
function formatMessageTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  // Yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) return "Yesterday";

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function MessagesPage() {
  const { threads, connections } = Route.useLoaderData();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicProfile[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);

  const totalUnread = threads.reduce((s, t) => s + t.unread, 0);

  // Build set of user ids already in threads so we don't duplicate
  const threadUserIds = new Set(threads.map((t) => t.other.id));
  // Connections not yet in any thread — show as quick-start
  const connectionShortcuts = connections.filter(
    (c) => !threadUserIds.has(c.user_id),
  );

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

  async function handleMarkAllRead() {
    setMarkingRead(true);
    try {
      const result = await markAllRead();
      if (!result.ok) {
        toast.error("Could not mark all as read.");
        return;
      }
      await router.invalidate();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setMarkingRead(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Messages
          </h1>
          <p className="text-sm text-muted-foreground">
            Private conversations. Blocked people never appear here.
          </p>
        </div>
        {totalUnread > 0 && (
          <button
            onClick={() => void handleMarkAllRead()}
            disabled={markingRead}
            className="shrink-0 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-all hover:border-foreground/20 hover:text-foreground disabled:opacity-50"
          >
            {markingRead ? "Marking…" : "Mark all read"}
          </button>
        )}
      </div>

      {/* ── Stats strip ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4">
        <StatChip label="Conversations" value={String(threads.length)} />
        <StatChip
          label="Unread"
          value={String(totalUnread)}
          accent={totalUnread > 0}
        />
      </div>

      {/* ── Pill search ─────────────────────────────────────────── */}
      <form onSubmit={handleSearch} className="flex items-center gap-3">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
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

      {/* ── Connection quick-starts ─────────────────────────────── */}
      {connectionShortcuts.length > 0 && results === null && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Connections — start a conversation
          </h2>
          <div className="flex flex-wrap gap-2">
            {connectionShortcuts.map((conn) => (
              <Link
                key={conn.user_id}
                to="/messages/$userId"
                params={{ userId: conn.user_id }}
                className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-all hover:border-foreground/20"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                  {((conn.display_name?.trim() ?? "M")[0] ?? "M").toUpperCase()}
                </div>
                {conn.display_name?.trim() || "Member"}
              </Link>
            ))}
          </div>
        </section>
      )}

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
                        {(
                          (person.display_name?.trim() ?? "M")[0] ?? "M"
                        ).toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        {person.display_name?.trim() || "Member"}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Message →
                    </span>
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
                    <p
                      className={`truncate text-sm ${thread.unread > 0 ? "font-semibold text-foreground" : "font-medium text-foreground"}`}
                    >
                      {thread.other_name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {thread.last_body}
                    </p>
                  </div>

                  {/* Smart timestamp */}
                  <time
                    dateTime={thread.last_at}
                    className="shrink-0 text-[11px] text-muted-foreground"
                  >
                    {formatMessageTime(thread.last_at)}
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
      <span className="text-xl font-semibold leading-none text-foreground">
        {value}
      </span>
    </div>
  );
}
