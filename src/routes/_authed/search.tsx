import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Clock, X } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";

import { Avatar } from "../../components/Avatar";
import { EmptyState } from "../../components/EmptyState";
import { MeetupCard } from "../../components/meetup/MeetupCard";
import {
  Chip,
  PageHeader,
  RouteError,
  SearchInput,
} from "../../components/PageChrome";
import { VenueCard } from "../../components/VenueCard";
import { VerifiedBadge } from "../../components/VerifiedBadge";
import { fetchMyFavorites } from "../../lib/favorites";
import { INTERESTS, interestLabel } from "../../lib/profile";
import { searchAll, type SearchResults } from "../../lib/search";
import { pageHead } from "../../lib/seo";
import { categoryLabel, VENUE_CATEGORIES } from "../../lib/venue-filters";

const searchSchema = z.object({ q: z.string().max(60).optional() });

const RECENT_KEY = "recent-searches";
const RECENT_MAX = 8;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

function writeRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    // Private mode or storage disabled; recents are a convenience only.
  }
}

export const Route = createFileRoute("/_authed/search")({
  validateSearch: (search) => searchSchema.parse(search),
  loaderDeps: ({ search }) => ({ q: search.q ?? "" }),
  loader: async ({ deps }) => {
    const [results, favorites] = await Promise.all([
      deps.q.trim().length > 0
        ? searchAll({ data: { query: deps.q.trim() } })
        : Promise.resolve<SearchResults | null>(null),
      fetchMyFavorites(),
    ]);
    return { results, favorites };
  },
  head: () => pageHead("Search", "Find venues, people and meetups."),
  errorComponent: () => <RouteError title="Search is unavailable" />,
  component: SearchPage,
});

function SearchPage() {
  const { results, favorites } = Route.useLoaderData();
  const { q = "" } = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });
  const [draft, setDraft] = useState(q);
  const [recent, setRecent] = useState<string[]>([]);
  const favoriteSet = new Set(favorites);

  useEffect(() => setRecent(readRecent()), []);
  useEffect(() => setDraft(q), [q]);

  // Debounce typing into the URL, which is what the loader keys off. Keeping
  // the query in the URL makes a search shareable and survives a reload.
  useEffect(() => {
    const trimmed = draft.trim();
    if (trimmed === q) return;
    const handle = setTimeout(() => {
      void navigate({
        search: trimmed ? { q: trimmed } : {},
        replace: true,
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [draft, q, navigate]);

  // Remember what produced results.
  useEffect(() => {
    if (!results || !results.query) return;
    const total =
      results.venues.length + results.people.length + results.meetups.length;
    if (total === 0) return;
    setRecent((prev) => {
      const next = [
        results.query,
        ...prev.filter((r) => r.toLowerCase() !== results.query.toLowerCase()),
      ];
      writeRecent(next);
      return next.slice(0, RECENT_MAX);
    });
  }, [results]);

  function choose(value: string) {
    setDraft(value);
    void navigate({ search: { q: value } });
  }

  function forget(value: string) {
    setRecent((prev) => {
      const next = prev.filter((r) => r !== value);
      writeRecent(next);
      return next;
    });
  }

  const total = results
    ? results.venues.length + results.people.length + results.meetups.length
    : 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Search" subtitle="Venues, people and meetups." />

      <SearchInput
        value={draft}
        onChange={setDraft}
        placeholder="Try a venue, a name, or an interest like football…"
        label="Search"
        className="sm:w-full sm:max-w-xl"
        autoFocus
      />

      {!results ? (
        <div className="flex flex-col gap-6">
          {recent.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-foreground">Recent</h2>
              <ul className="flex flex-wrap gap-2">
                {recent.map((term) => (
                  <li
                    key={term}
                    className="flex items-center gap-1 rounded-full border border-border bg-card pl-3 pr-1 text-sm text-foreground"
                  >
                    <button
                      type="button"
                      onClick={() => choose(term)}
                      className="flex items-center gap-1.5 py-1.5"
                    >
                      <Clock
                        className="h-3.5 w-3.5 text-muted-foreground"
                        aria-hidden
                      />
                      {term}
                    </button>
                    <button
                      type="button"
                      onClick={() => forget(term)}
                      className="rounded-full p-1 text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${term} from recent searches`}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-foreground">
              Browse venues by type
            </h2>
            <ul className="flex flex-wrap gap-2">
              {VENUE_CATEGORIES.map((category) => (
                <li key={category.value}>
                  <Chip
                    active={false}
                    onClick={() => choose(categoryLabel(category.value))}
                  >
                    {category.label}
                  </Chip>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-foreground">
              People who are into…
            </h2>
            <ul className="flex flex-wrap gap-2">
              {INTERESTS.map((interest) => (
                <li key={interest}>
                  <Chip
                    active={false}
                    onClick={() => choose(interestLabel(interest))}
                  >
                    {interestLabel(interest)}
                  </Chip>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : total === 0 ? (
        <EmptyState
          title={`Nothing for “${results.query}”`}
          body="Try a venue name, a person's name, or an interest."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {results.people.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-foreground">
                People ({results.people.length})
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {results.people.map((person) => (
                  <li key={person.id}>
                    <Link
                      to="/people/$userId"
                      params={{ userId: person.id }}
                      className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm transition-colors hover:border-foreground/20"
                    >
                      <Avatar
                        name={person.display_name}
                        url={person.avatar_url}
                        size="sm"
                        tone="muted"
                      />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                          {person.display_name?.trim() || "Member"}
                          {person.is_verified ? <VerifiedBadge /> : null}
                        </p>
                        {person.interests && person.interests.length > 0 ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {person.interests
                              .slice(0, 3)
                              .map(interestLabel)
                              .join(" · ")}
                          </p>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {results.venues.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-foreground">
                Venues ({results.venues.length})
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {results.venues.map((venue) => (
                  <VenueCard
                    key={venue.slug}
                    venue={venue}
                    favorited={favoriteSet.has(venue.slug)}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {results.meetups.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-foreground">
                Meetups ({results.meetups.length})
              </h2>
              <ul className="grid gap-4 md:grid-cols-2">
                {results.meetups.map((meetup) => (
                  <MeetupCard key={meetup.id} meetup={meetup} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
