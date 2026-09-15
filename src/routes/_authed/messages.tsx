import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Avatar } from "../../components/Avatar";
import { EmptyState } from "../../components/EmptyState";
import {
  PageHeader,
  RouteError,
  SearchInput,
  pillClass,
  primaryPillClass,
} from "../../components/PageChrome";
import {
  StatChipSkeleton,
  ThreadSkeletonList,
} from "../../components/Skeletons";
import { StatChip } from "../../components/StatChip";
import { fetchDmThreads, markAllRead } from "../../lib/messaging";
import { searchPeople, type PublicProfile } from "../../lib/people";
import { pageHead } from "../../lib/seo";
import { fetchMyConnections } from "../../lib/social";
import { formatRelative } from "../../lib/utils";

export const Route = createFileRoute("/_authed/messages")({
  loader: async () => {
    const [threads, connections] = await Promise.all([
      fetchDmThreads(),
      fetchMyConnections(),
    ]);
    return { threads, connections };
  },
  head: () => pageHead("Messages"),
  pendingComponent: MessagesSkeleton,
  errorComponent: () => <RouteError title="Could not load messages" />,
  component: MessagesPage,
});

function MessagesSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy>
      <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
      <StatChipSkeleton count={2} />
      <ThreadSkeletonList count={4} />
    </div>
  );
}

function MessagesPage() {
  const { threads, connections } = Route.useLoaderData();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicProfile[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);

  const totalUnread = threads.reduce((s, t) => s + t.unread, 0);
  const threadUserIds = new Set(threads.map((t) => t.other.id));
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
    } catch {
      toast.error("Search failed. Try again.");
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
      <PageHeader
        title="Messages"
        subtitle="Private conversations. Blocked people never appear here."
        actions={
          totalUnread > 0 ? (
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              disabled={markingRead}
              className={pillClass("text-xs")}
            >
              {markingRead ? "Marking…" : "Mark all read"}
            </button>
          ) : null
        }
      />

      <div className="flex flex-wrap gap-4">
        <StatChip label="Conversations" value={String(threads.length)} />
        <StatChip
          label="Unread"
          value={String(totalUnread)}
          accent={totalUnread > 0}
        />
      </div>

      <form
        onSubmit={handleSearch}
        className="flex flex-wrap items-center gap-3"
      >
        <SearchInput
          value={query}
          onChange={(v) => {
            setQuery(v);
            if (v.trim().length < 2) setResults(null);
          }}
          placeholder="Find someone by name…"
          label="Search members"
        />
        <button
          type="submit"
          disabled={searching || query.trim().length < 2}
          className={primaryPillClass()}
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </form>

      {connectionShortcuts.length > 0 && results === null ? (
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
                className={pillClass("gap-2 text-foreground")}
              >
                <Avatar
                  name={conn.display_name}
                  url={conn.avatar_url}
                  size="xs"
                />
                {conn.display_name?.trim() || "Member"}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {results !== null ? (
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
                    <span className="flex items-center gap-3">
                      <Avatar
                        name={person.display_name}
                        url={person.avatar_url}
                        size="sm"
                      />
                      <span className="text-sm font-medium text-foreground">
                        {person.display_name?.trim() || "Member"}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Message
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Conversations
        </h2>
        {threads.length === 0 ? (
          <EmptyState
            title="No conversations yet"
            body="Search for someone above, or message a connection, to start one."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {threads.map((thread) => (
              <li key={thread.other.id}>
                <Link
                  to="/messages/$userId"
                  params={{ userId: thread.other.id }}
                  className="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm transition-all hover:border-foreground/20"
                >
                  <div className="relative shrink-0">
                    <Avatar
                      name={thread.other_name}
                      url={thread.other.avatar_url}
                    />
                    {thread.unread > 0 ? (
                      <span
                        className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground"
                        aria-label={`${thread.unread} unread`}
                      >
                        {thread.unread}
                      </span>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-sm ${thread.unread > 0 ? "font-semibold" : "font-medium"} text-foreground`}
                    >
                      {thread.other_name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {thread.last_body}
                    </p>
                  </div>
                  <time
                    dateTime={thread.last_at}
                    className="shrink-0 text-[11px] text-muted-foreground"
                  >
                    {formatRelative(thread.last_at)}
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
