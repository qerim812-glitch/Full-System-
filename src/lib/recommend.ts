import type { MeetupSummary } from "./meetups";

export type RecommendedMeetup = {
  meetup: MeetupSummary;
  reasons: string[];
  score: number;
};

/**
 * Rank upcoming meetups the viewer has not joined by how likely they are to
 * want to: a host who shares their interests, a venue they favourited, or
 * connections going. Pure — no I/O — so it is unit-testable.
 */
export function recommendMeetups(
  meetups: readonly MeetupSummary[],
  viewer: {
    sharedInterestHostIds: ReadonlySet<string>;
    favouriteSlugs: ReadonlySet<string>;
    connectionIds: ReadonlySet<string>;
    /** meetup id → connection ids going, when known. */
    connectionsGoing?: ReadonlyMap<string, readonly string[]>;
  },
  limit = 4,
): RecommendedMeetup[] {
  const out: RecommendedMeetup[] = [];
  for (const meetup of meetups) {
    if (meetup.isHost || meetup.myStatus !== null) continue;
    if (meetup.status !== "open" || meetup.going >= meetup.capacity) continue;

    const reasons: string[] = [];
    let score = 0;
    if (viewer.connectionIds.has(meetup.host_id)) {
      reasons.push("Hosted by a connection");
      score += 3;
    }
    const going = viewer.connectionsGoing?.get(meetup.id) ?? [];
    if (going.length > 0) {
      reasons.push(
        going.length === 1
          ? "A connection is going"
          : `${going.length} connections are going`,
      );
      score += 2 + Math.min(going.length, 3);
    }
    if (viewer.favouriteSlugs.has(meetup.venue_slug)) {
      reasons.push("At a venue you favourited");
      score += 2;
    }
    if (viewer.sharedInterestHostIds.has(meetup.host_id)) {
      reasons.push("Host shares your interests");
      score += 2;
    }
    if (reasons.length === 0) continue;
    out.push({ meetup, reasons, score });
  }
  return out
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.meetup.meet_date.localeCompare(b.meetup.meet_date),
    )
    .slice(0, limit);
}
