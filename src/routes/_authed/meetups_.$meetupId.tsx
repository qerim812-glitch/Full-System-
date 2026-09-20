import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  CalendarPlus,
  Clock,
  Lock,
  MapPin,
  Repeat,
  Share2,
  UserMinus,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Avatar } from "../../components/Avatar";
import { ConfirmButton } from "../../components/ConfirmButton";
import { MeetupChat } from "../../components/meetup/MeetupChat";
import {
  BackLink,
  PageHeader,
  RouteError,
  pillClass,
  primaryPillClass,
} from "../../components/PageChrome";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { buildIcs, downloadIcs } from "../../lib/ics";
import {
  cancelMeetup,
  fetchMeetup,
  removeAttendee,
  sharePlanText,
  joinAction,
  joinMeetup,
  joinPolicyLabel,
  leaveMeetup,
  respondToJoinRequest,
  scheduleNextMeetup,
  seatsLeft,
  visibilityLabel,
} from "../../lib/meetups";
import { pageHead } from "../../lib/seo";
import { formatBookingDate } from "../../lib/utils";

export const Route = createFileRoute("/_authed/meetups_/$meetupId")({
  loader: async ({ params }) => ({
    meetup: await fetchMeetup({ data: { id: params.meetupId } }),
  }),
  head: ({ loaderData }) =>
    pageHead(
      loaderData?.meetup?.title ?? "Meetup",
      loaderData?.meetup
        ? `${loaderData.meetup.venue_name ?? ""} · ${formatBookingDate(loaderData.meetup.meet_date)}`
        : "Meetup on Social Circle.",
      // Meetups are never public pages — some are connections-only, and even a
      // public one lists who is attending.
      { noindex: true },
    ),
  errorComponent: () => (
    <RouteError
      title="Could not load that meetup"
      backTo="/meetups"
      backLabel="Back to meetups"
    />
  ),
  component: MeetupDetailPage,
});

function MeetupDetailPage() {
  const { meetup } = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!meetup) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink to="/meetups">Back to meetups</BackLink>
        <RouteError
          title="Meetup not found"
          body="It may have been cancelled, or it is only visible to the host's connections."
        />
      </div>
    );
  }

  const left = seatsLeft(meetup.capacity, meetup.going);
  const action = joinAction(meetup);

  async function run(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    okMessage: string,
  ) {
    setBusy(true);
    try {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong.");
        return;
      }
      toast.success(okMessage);
      await router.invalidate();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Sends a friend where you are going, which the community guidelines ask
   * people to do before meeting someone new.
   *
   * Uses the Web Share sheet where it exists — on a phone that is the friend's
   * actual messaging app, which is the point. Falls back to the clipboard on
   * desktop. An AbortError means the person dismissed the sheet, which is not
   * a failure and must not raise a toast.
   */
  async function sharePlans() {
    if (!meetup) return;
    const text = sharePlanText({
      title: meetup.title,
      venueName: meetup.venue_name ?? meetup.venue_slug,
      date: formatBookingDate(meetup.meet_date),
      time: meetup.meet_time,
      hostName: meetup.isHost ? null : meetup.host_name,
    });
    try {
      if (navigator.share) {
        await navigator.share({ title: meetup.title, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast.success("Copied — send it to someone you trust.");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      toast.error("Could not share that. You can copy the details manually.");
    }
  }

  function addToCalendar() {
    if (!meetup) return;
    const ics = buildIcs({
      uid: meetup.id,
      title: `${meetup.title} — ${meetup.venue_name ?? meetup.venue_slug}`,
      description: meetup.description ?? "",
      location: meetup.venue_name ?? meetup.venue_slug,
      date: meetup.meet_date,
      time: `${meetup.meet_time}:00`,
      durationMinutes: 120,
    });
    downloadIcs(`social-circle-${meetup.meet_date}-meetup.ics`, ics);
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink to="/meetups">Back to meetups</BackLink>

      {meetup.status === "cancelled" ? (
        <Alert variant="destructive">
          <AlertDescription>
            This meetup was cancelled by the host.
          </AlertDescription>
        </Alert>
      ) : null}

      <PageHeader title={meetup.title} subtitle={meetup.description ?? ""} />

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-2 text-sm">
            <Clock
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <div>
              <dt className="sr-only">When</dt>
              <dd className="font-medium text-foreground">
                {formatBookingDate(meetup.meet_date)} at {meetup.meet_time}
              </dd>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <MapPin
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <div className="min-w-0">
              <dt className="sr-only">Where</dt>
              <dd className="truncate font-medium text-foreground">
                <Link
                  to="/venues/$slug"
                  params={{ slug: meetup.venue_slug }}
                  className="hover:underline"
                >
                  {meetup.venue_name ?? meetup.venue_slug}
                </Link>
                {meetup.location_name ? ` · ${meetup.location_name}` : ""}
              </dd>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Users
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <div>
              <dt className="sr-only">Seats</dt>
              <dd className="font-medium text-foreground">
                {meetup.going} of {meetup.capacity} going
                {left > 0 ? ` · ${left} left` : " · full"}
              </dd>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Lock
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <div>
              <dt className="sr-only">Access</dt>
              <dd className="text-muted-foreground">
                {joinPolicyLabel(meetup.join_policy)} ·{" "}
                {visibilityLabel(meetup.visibility)}
              </dd>
            </div>
          </div>
        </dl>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {action.kind === "join" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(
                  () => joinMeetup({ data: { id: meetup.id } }),
                  meetup.join_policy === "approval"
                    ? "Request sent to the host."
                    : "You're going.",
                )
              }
              className={primaryPillClass()}
            >
              {action.label}
            </button>
          ) : action.kind === "leave" ? (
            <ConfirmButton
              title="Leave this meetup?"
              description="Your seat goes back to whoever wants it. You can ask to join again later."
              confirmLabel="Leave"
              onConfirm={() =>
                run(
                  () => leaveMeetup({ data: { id: meetup.id } }),
                  "You left the meetup.",
                )
              }
              disabled={busy}
              className={pillClass("", { danger: true })}
            >
              Leave meetup
            </ConfirmButton>
          ) : (
            <span className={pillClass("pointer-events-none opacity-70")}>
              {action.label}
            </span>
          )}

          {meetup.myStatus === "joined" || meetup.isHost ? (
            <>
              <button
                type="button"
                onClick={addToCalendar}
                className={pillClass("gap-1.5")}
              >
                <CalendarPlus className="h-4 w-4" aria-hidden />
                Add to calendar
              </button>
              <button
                type="button"
                onClick={() => void sharePlans()}
                className={pillClass("gap-1.5")}
              >
                <Share2 className="h-4 w-4" aria-hidden />
                Share my plans
              </button>
            </>
          ) : null}

          {meetup.isHost &&
          meetup.recurrence !== "none" &&
          meetup.status !== "cancelled" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await scheduleNextMeetup({
                    data: { id: meetup.id },
                  });
                  if (result.ok && result.id) {
                    await router.navigate({
                      to: "/meetups/$meetupId",
                      params: { meetupId: result.id },
                    });
                  }
                  return result;
                }, "Next one booked — last time's guests have been told.")
              }
              className={pillClass("gap-1.5")}
            >
              <Repeat className="h-4 w-4" aria-hidden />
              Schedule the next one
            </button>
          ) : null}

          {meetup.isHost && meetup.status === "open" ? (
            <ConfirmButton
              title="Cancel this meetup?"
              description="Everyone going is notified and the table is released. This cannot be undone."
              confirmLabel="Cancel meetup"
              onConfirm={() =>
                run(
                  () => cancelMeetup({ data: { id: meetup.id } }),
                  "Meetup cancelled and the table released.",
                )
              }
              disabled={busy}
              className={pillClass("ml-auto", { danger: true })}
            >
              Cancel meetup
            </ConfirmButton>
          ) : null}
        </div>
      </section>

      {/* Host-only: pending requests, when the join policy is 'approval'. */}
      {meetup.isHost && meetup.pending.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">
            Requests to join ({meetup.pending.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {meetup.pending.map((person) => (
              <li
                key={person.user_id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-4 py-3"
              >
                <Link
                  to="/people/$userId"
                  params={{ userId: person.user_id }}
                  className="flex min-w-0 flex-1 items-center gap-2"
                >
                  <Avatar
                    name={person.display_name}
                    url={person.avatar_url}
                    size="sm"
                    tone="muted"
                  />
                  <span className="truncate text-sm font-medium text-foreground hover:underline">
                    {person.display_name ?? "Member"}
                  </span>
                </Link>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy || left === 0}
                    title={left === 0 ? "The meetup is full" : undefined}
                    onClick={() =>
                      void run(
                        () =>
                          respondToJoinRequest({
                            data: {
                              meetupId: meetup.id,
                              userId: person.user_id,
                              approve: true,
                            },
                          }),
                        `${person.display_name ?? "They"} are going.`,
                      )
                    }
                    className={primaryPillClass("text-xs")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          respondToJoinRequest({
                            data: {
                              meetupId: meetup.id,
                              userId: person.user_id,
                              approve: false,
                            },
                          }),
                        "Request declined.",
                      )
                    }
                    className={pillClass("text-xs", { danger: true })}
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">
          Who's going ({meetup.attendees.length})
        </h2>
        <ul className="flex flex-wrap gap-3">
          {meetup.attendees.map((person) => (
            <li key={person.user_id} className="flex items-center gap-1">
              <Link
                to="/people/$userId"
                params={{ userId: person.user_id }}
                className="flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-1.5 pr-4 shadow-sm transition-colors hover:border-foreground/20"
              >
                <Avatar
                  name={person.display_name}
                  url={person.avatar_url}
                  size="sm"
                  tone="muted"
                />
                <span className="text-sm text-foreground">
                  {person.display_name ?? "Member"}
                </span>
                {person.isHost ? (
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground">
                    Host
                  </span>
                ) : null}
              </Link>
              {/* Without this a host's only lever against one bad guest is to
                  cancel on everybody. */}
              {meetup.isHost && !person.isHost && meetup.status === "open" ? (
                <ConfirmButton
                  title={`Remove ${person.display_name ?? "this member"}?`}
                  description="They lose their seat and are told they were removed. They can ask to join again, and you will see the request."
                  confirmLabel="Remove"
                  onConfirm={() =>
                    run(
                      () =>
                        removeAttendee({
                          data: {
                            meetupId: meetup.id,
                            userId: person.user_id,
                          },
                        }),
                      "Removed from the meetup.",
                    )
                  }
                  disabled={busy}
                  className={pillClass("h-8 w-8 !px-0", { danger: true })}
                >
                  <UserMinus className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">
                    Remove {person.display_name ?? "member"}
                  </span>
                </ConfirmButton>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {meetup.isHost || meetup.myStatus === "joined" ? (
        <MeetupChat
          meetupId={meetup.id}
          venueSlug={meetup.venue_slug}
          going={meetup.going}
          readOnly={meetup.status === "cancelled"}
        />
      ) : null}
    </div>
  );
}
