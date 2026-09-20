import { Link } from "@tanstack/react-router";
import { Clock, Lock, MapPin, Repeat, Users } from "lucide-react";

import {
  joinPolicyLabel,
  recurrenceLabel,
  seatsLeft,
  type MeetupSummary,
} from "../../lib/meetups";
import { formatBookingDate } from "../../lib/utils";
import { Avatar } from "../Avatar";

/** One meetup in a list. Whole card is the link — bigger tap target on phones. */
export function MeetupCard({ meetup }: { meetup: MeetupSummary }) {
  const left = seatsLeft(meetup.capacity, meetup.going);

  return (
    <li className="rounded-2xl border border-border bg-card shadow-sm transition-colors hover:border-foreground/20">
      <Link
        to="/meetups/$meetupId"
        params={{ meetupId: meetup.id }}
        className="flex flex-col gap-3 p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-foreground">
              {meetup.title}
            </h3>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">
                {meetup.venue_name ?? meetup.venue_slug}
                {meetup.location_name ? ` · ${meetup.location_name}` : ""}
              </span>
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold ${
              left === 0
                ? "bg-muted text-muted-foreground"
                : "bg-accent text-accent-foreground"
            }`}
          >
            {left === 0 ? "Full" : `${left} left`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {formatBookingDate(meetup.meet_date)} · {meetup.meet_time}
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" aria-hidden />
            {meetup.going} of {meetup.capacity} going
          </span>
          {meetup.recurrence !== "none" ? (
            <span className="flex items-center gap-1.5">
              <Repeat className="h-3.5 w-3.5" aria-hidden />
              {recurrenceLabel(meetup.recurrence)}
            </span>
          ) : null}
          {meetup.visibility === "connections" ? (
            <span className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              Connections only
            </span>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <span className="flex min-w-0 items-center gap-2">
            <Avatar
              name={meetup.host_name}
              url={meetup.host_avatar}
              size="sm"
              tone="muted"
            />
            <span className="truncate text-xs text-muted-foreground">
              Hosted by{" "}
              <span className="font-medium text-foreground">
                {meetup.isHost ? "you" : (meetup.host_name ?? "a member")}
              </span>
            </span>
          </span>

          {meetup.myStatus === "joined" ? (
            <span className="shrink-0 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-accent-foreground">
              Going
            </span>
          ) : meetup.myStatus === "pending" ? (
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
              Requested
            </span>
          ) : (
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {joinPolicyLabel(meetup.join_policy)}
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}
