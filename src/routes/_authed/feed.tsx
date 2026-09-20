import { createFileRoute, Link } from "@tanstack/react-router";
import { MapPin, SquarePlus, Sparkles, UserPlus } from "lucide-react";
import { useState } from "react";

import { Avatar } from "../../components/Avatar";
import { EmptyState } from "../../components/EmptyState";
import {
  PageHeader,
  RouteError,
  pillClass,
  primaryPillClass,
} from "../../components/PageChrome";
import { StatChip } from "../../components/StatChip";
import { StatChipSkeleton } from "../../components/Skeletons";
import { MeetupCard } from "../../components/meetup/MeetupCard";
import { PostFeed } from "../../components/post/PostFeed";
import { StoriesRow } from "../../components/post/StoriesRow";
import { VerifiedBadge } from "../../components/VerifiedBadge";
import { fetchFeed } from "../../lib/feed";
import { fetchMeetups } from "../../lib/meetups";
import { fetchPosts, fetchStories } from "../../lib/posts";
import { interestLabel } from "../../lib/profile";
import { pageHead } from "../../lib/seo";
import { formatBookingDate } from "../../lib/utils";

export const Route = createFileRoute("/_authed/feed")({
  loader: async () => {
    const [feed, meetups, posts, connectionPosts, stories] = await Promise.all([
      fetchFeed(),
      fetchMeetups({ data: { scope: "upcoming" } }),
      fetchPosts({ data: { scope: "all" } }),
      fetchPosts({ data: { scope: "connections" } }),
      fetchStories(),
    ]);
    return { feed, meetups, posts, connectionPosts, stories };
  },
  head: () =>
    pageHead("Tonight", "What's happening in Tirana and who's going out."),
  pendingComponent: () => (
    <div className="flex flex-col gap-8" aria-busy>
      <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
      <StatChipSkeleton count={3} />
      <div className="h-40 animate-pulse rounded-2xl bg-muted" />
      <div className="h-40 animate-pulse rounded-2xl bg-muted" />
    </div>
  ),
  errorComponent: () => <RouteError title="Could not load your feed" />,
  component: FeedPage,
});

function FeedPage() {
  const { feed, meetups, posts, connectionPosts, stories } =
    Route.useLoaderData();
  const [postScope, setPostScope] = useState<"all" | "connections">("all");

  const tonight = meetups.filter((m) => m.meet_date === feed.today);
  const later = meetups.filter((m) => m.meet_date > feed.today).slice(0, 4);
  const openTonight = tonight.filter(
    (m) => !m.isHost && m.myStatus === null && m.going < m.capacity,
  );

  const nothingAtAll =
    meetups.length === 0 &&
    posts.posts.length === 0 &&
    feed.connectionCheckins.length === 0 &&
    feed.suggested.length === 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Tonight in Tirana"
        subtitle="Meetups you can join, where your connections are going, and people worth knowing."
        actions={
          <Link to="/new" className={primaryPillClass("gap-1.5")}>
            <SquarePlus className="h-4 w-4" aria-hidden />
            New post
          </Link>
        }
      />

      <StoriesRow groups={stories} />

      <div className="flex flex-wrap gap-4">
        <StatChip
          label="Meetups tonight"
          value={String(tonight.length)}
          accent
        />
        <StatChip label="Seats open" value={String(openTonight.length)} />
        <StatChip
          label="Connections out"
          value={String(feed.connectionCheckins.length)}
        />
      </div>

      {nothingAtAll ? (
        <EmptyState
          title="Quiet so far"
          body="Nothing is planned yet. Host a meetup, or check in at a venue so your connections know where you'll be."
        />
      ) : null}

      {tonight.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-foreground">Tonight</h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {tonight.map((meetup) => (
              <MeetupCard key={meetup.id} meetup={meetup} />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">Posts</h2>
          <div
            role="group"
            aria-label="Show posts from"
            className="flex gap-0.5 rounded-full border border-border bg-card p-0.5"
          >
            {(
              [
                ["all", "Everyone"],
                ["connections", "Connections"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={postScope === value}
                onClick={() => setPostScope(value)}
                className={
                  postScope === value
                    ? "rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
                    : "rounded-full px-3 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mx-auto w-full max-w-xl">
          {postScope === "all" ? (
            <PostFeed
              key="all"
              initial={posts}
              scope="all"
              emptyTitle="No posts yet"
              emptyBody="Be the first to say where you're heading tonight."
            />
          ) : (
            <PostFeed
              key="connections"
              initial={connectionPosts}
              scope="connections"
              emptyTitle="Nothing from your connections yet"
              emptyBody="Connect with people and their posts and check-ins show up here."
            />
          )}
        </div>
      </section>

      {feed.connectionCheckins.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-foreground">
            Your connections are going out
          </h2>
          <ul className="flex flex-col gap-2">
            {feed.connectionCheckins.map((checkin) => (
              <li
                key={`${checkin.user_id}-${checkin.venue_slug}-${checkin.checkin_date}`}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm"
              >
                <Avatar
                  name={checkin.display_name}
                  url={checkin.avatar_url}
                  size="sm"
                  tone="muted"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">
                    <Link
                      to="/people/$userId"
                      params={{ userId: checkin.user_id }}
                      className="font-medium hover:underline"
                    >
                      {checkin.display_name ?? "A connection"}
                    </Link>{" "}
                    is at{" "}
                    <Link
                      to="/venues/$slug"
                      params={{ slug: checkin.venue_slug }}
                      className="font-medium hover:underline"
                    >
                      {checkin.venue_name ?? checkin.venue_slug}
                    </Link>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatBookingDate(checkin.checkin_date)}
                    {checkin.note ? ` · ${checkin.note}` : ""}
                  </p>
                </div>
                <Link
                  to="/venues/$slug"
                  params={{ slug: checkin.venue_slug }}
                  className={pillClass("shrink-0 gap-1.5 text-xs")}
                >
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                  See venue
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {later.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-foreground">
            Coming up this week
          </h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {later.map((meetup) => (
              <MeetupCard key={meetup.id} meetup={meetup} />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden />
          People you might get on with
        </h2>

        {feed.myInterests.length === 0 ? (
          // Without interests there is nothing to match on, so say what to do
          // rather than showing an empty list that looks broken.
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border px-5 py-4">
            <p className="text-sm text-muted-foreground">
              Add a few interests to your profile and we'll show you people who
              share them.
            </p>
            <Link to="/account" className={primaryPillClass("text-xs")}>
              Add interests
            </Link>
          </div>
        ) : feed.suggested.length === 0 ? (
          <EmptyState
            title="Nobody new right now"
            body="As more members add interests, people who share yours will show up here."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {feed.suggested.map((person) => (
              <li
                key={person.id}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <Avatar
                    name={person.display_name}
                    url={person.avatar_url}
                    size="sm"
                    tone="muted"
                  />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                      {person.display_name ?? "Member"}
                      {person.is_verified ? <VerifiedBadge /> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {person.shared.length} shared
                    </p>
                  </div>
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {person.shared.slice(0, 4).map((interest) => (
                    <li
                      key={interest}
                      className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-medium text-accent-foreground"
                    >
                      {interestLabel(interest)}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/people/$userId"
                  params={{ userId: person.id }}
                  className={pillClass("gap-1.5 text-xs")}
                >
                  <UserPlus className="h-3.5 w-3.5" aria-hidden />
                  View profile
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
