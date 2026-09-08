import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Messages
        </h1>
        <p className="text-sm text-muted-foreground">
          Private conversations. Blocked people never appear here.
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex max-w-md gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find someone by name…"
          aria-label="Search members"
        />
        <Button type="submit" disabled={searching || query.trim().length < 2}>
          {searching ? "Searching…" : "Search"}
        </Button>
      </form>

      {results !== null ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Search results
          </h2>
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nobody matches “{query.trim()}”.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {results.map((person) => (
                <li key={person.id}>
                  <Link
                    to="/messages/$userId"
                    params={{ userId: person.id }}
                    className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-accent"
                  >
                    <span className="font-medium text-foreground">
                      {person.display_name?.trim() || "Member"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Message →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">Conversations</h2>
        {threads.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
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
                  className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-3 transition-colors hover:bg-accent"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {thread.other_name}
                      </span>
                      {thread.unread > 0 ? (
                        <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary-foreground">
                          {thread.unread}
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {thread.last_body}
                    </p>
                  </div>
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
