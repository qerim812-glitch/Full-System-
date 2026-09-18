import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { EmptyState } from "../../components/EmptyState";
import { Chip, PageHeader, RouteError } from "../../components/PageChrome";
import { StatChip } from "../../components/StatChip";
import { StatChipSkeleton } from "../../components/Skeletons";
import { CreateMeetupDialog } from "../../components/meetup/CreateMeetupDialog";
import { MeetupCard } from "../../components/meetup/MeetupCard";
import { fetchMeetups } from "../../lib/meetups";
import { pageHead } from "../../lib/seo";
import { fetchVenues } from "../../lib/venues";

type Scope = "upcoming" | "going" | "hosting";

const SCOPES: Array<{ id: Scope; label: string }> = [
  { id: "upcoming", label: "All upcoming" },
  { id: "going", label: "I'm going" },
  { id: "hosting", label: "I'm hosting" },
];

export const Route = createFileRoute("/_authed/meetups")({
  loader: async () => {
    const [meetups, venues] = await Promise.all([
      fetchMeetups({ data: { scope: "upcoming" } }),
      fetchVenues(),
    ]);
    return { meetups, venues };
  },
  head: () =>
    pageHead(
      "Meetups",
      "Join people going out in Tirana tonight, or host your own.",
    ),
  pendingComponent: () => (
    <div className="flex flex-col gap-8" aria-busy>
      <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
      <StatChipSkeleton count={3} />
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted" />
      ))}
    </div>
  ),
  errorComponent: () => <RouteError title="Could not load meetups" />,
  component: MeetupsPage,
});

/**
 * The discovery page.
 *
 * All three scopes are derived from the one list the loader already fetched,
 * rather than re-querying per tab: the list is capped at 60 upcoming meetups,
 * so filtering in the browser is instant and costs nothing. `fetchMeetups`
 * still takes a scope for callers that want the server to do it.
 */
function MeetupsPage() {
  const { meetups, venues } = Route.useLoaderData();
  const [scope, setScope] = useState<Scope>("upcoming");

  const going = meetups.filter(
    (m) => m.myStatus === "joined" || m.myStatus === "pending",
  );
  const hosting = meetups.filter((m) => m.isHost);

  const visible =
    scope === "going" ? going : scope === "hosting" ? hosting : meetups;

  // Today in Tirana, matching how the server filtered the list.
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Tirane",
  });
  const tonight = meetups.filter((m) => m.meet_date === today);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Meetups"
          subtitle="Someone books a table and opens the seats. Join one, or host your own."
        />
        <CreateMeetupDialog venues={venues} />
      </div>

      <div className="flex flex-wrap gap-4">
        <StatChip label="Tonight" value={String(tonight.length)} accent />
        <StatChip label="Upcoming" value={String(meetups.length)} />
        <StatChip label="You're going to" value={String(going.length)} />
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter">
        {SCOPES.map((option) => (
          <Chip
            key={option.id}
            active={scope === option.id}
            onClick={() => setScope(option.id)}
            className="px-4 py-1.5 text-sm"
          >
            {option.label}
          </Chip>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={
            scope === "hosting"
              ? "You are not hosting anything yet"
              : scope === "going"
                ? "You have not joined a meetup yet"
                : "No meetups planned yet"
          }
          body={
            scope === "upcoming"
              ? "Be the first — book a table and open the seats to everyone."
              : "Browse what's coming up, or host one yourself."
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {visible.map((meetup) => (
            <MeetupCard key={meetup.id} meetup={meetup} />
          ))}
        </ul>
      )}
    </div>
  );
}
