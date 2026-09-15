import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Avatar } from "../../components/Avatar";
import { ConfirmButton } from "../../components/ConfirmButton";
import {
  BackLink,
  RouteError,
  pillClass,
  primaryPillClass,
} from "../../components/PageChrome";
import { ReportDialog } from "../../components/ReportDialog";
import { StarRating } from "../../components/StarRating";
import { StatChip } from "../../components/StatChip";
import { blockUser, unblockUser } from "../../lib/messaging";
import { fetchMemberProfile } from "../../lib/people";
import { pageHead } from "../../lib/seo";
import {
  removeConnection,
  respondToRequest,
  sendConnectionRequest,
} from "../../lib/social";
import { formatDate } from "../../lib/utils";

export const Route = createFileRoute("/_authed/people_/$userId")({
  loader: async ({ params }) => ({
    member: await fetchMemberProfile({ data: { userId: params.userId } }),
  }),
  head: ({ loaderData }) =>
    pageHead(
      loaderData?.member?.profile.display_name?.trim() || "Member",
      "Member profile on NewPop.",
      { noindex: true },
    ),
  errorComponent: () => (
    <RouteError
      title="Could not load this member"
      backTo="/people"
      backLabel="Back to People"
    />
  ),
  component: MemberPage,
});

function MemberPage() {
  const { member } = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!member) {
    return (
      <RouteError
        title="Member not found"
        body="This account may have been removed or suspended."
        backTo="/people"
        backLabel="Back to People"
      />
    );
  }

  const { profile, connection, mutuals, reviews, isMe, isBlocked } = member;
  const name = profile.display_name?.trim() || "Member";

  async function run(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    okMsg?: string,
  ) {
    setBusy(true);
    try {
      const result = await fn();
      if (!result.ok) toast.error(result.error ?? "Something went wrong.");
      else {
        if (okMsg) toast.success(okMsg);
        await router.invalidate();
      }
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <BackLink to="/people">People</BackLink>

      <div className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-start">
        <Avatar name={name} url={profile.avatar_url} size="xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {name}
            </h1>
            {isMe ? (
              <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">
                You
              </span>
            ) : connection.status === "accepted" ? (
              <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">
                Connected
              </span>
            ) : null}
            {isBlocked ? (
              <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">
                Blocked
              </span>
            ) : null}
          </div>
          {profile.created_at ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Member since {formatDate(profile.created_at)}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-3">
            <StatChip
              size="sm"
              label="Mutual connections"
              value={String(mutuals.length)}
            />
            <StatChip
              size="sm"
              label="Reviews"
              value={String(reviews.length)}
            />
          </div>

          {!isMe ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {!isBlocked ? (
                <Link
                  to="/messages/$userId"
                  params={{ userId: profile.id }}
                  className={primaryPillClass("text-xs")}
                >
                  Message
                </Link>
              ) : null}

              {connection.status === "none" ||
              connection.status === "declined" ? (
                <button
                  type="button"
                  disabled={busy || isBlocked}
                  onClick={() =>
                    run(
                      () =>
                        sendConnectionRequest({ data: { userId: profile.id } }),
                      "Request sent.",
                    )
                  }
                  className={pillClass("text-xs")}
                >
                  Connect
                </button>
              ) : connection.status === "pending_sent" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () =>
                        removeConnection({
                          data: { connectionId: connection.id },
                        }),
                      "Request withdrawn.",
                    )
                  }
                  className={pillClass("text-xs")}
                >
                  Requested · withdraw
                </button>
              ) : connection.status === "pending_recv" ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          respondToRequest({
                            data: { connectionId: connection.id, accept: true },
                          }),
                        "Connected!",
                      )
                    }
                    className={primaryPillClass("text-xs")}
                  >
                    Accept request
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          respondToRequest({
                            data: {
                              connectionId: connection.id,
                              accept: false,
                            },
                          }),
                        "Declined.",
                      )
                    }
                    className={pillClass("text-xs")}
                  >
                    Decline
                  </button>
                </>
              ) : connection.status === "accepted" ? (
                <ConfirmButton
                  title={`Remove ${name}?`}
                  description="You will stop seeing each other's plans."
                  confirmLabel="Remove"
                  onConfirm={() =>
                    run(
                      () =>
                        removeConnection({
                          data: { connectionId: connection.id },
                        }),
                      "Connection removed.",
                    )
                  }
                  disabled={busy}
                  className={pillClass("text-xs")}
                >
                  Remove connection
                </ConfirmButton>
              ) : null}

              <ReportDialog reportedUserId={profile.id} />

              {isBlocked ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => unblockUser({ data: { userId: profile.id } }),
                      `${name} unblocked.`,
                    )
                  }
                  className={pillClass("text-xs")}
                >
                  Unblock
                </button>
              ) : (
                <ConfirmButton
                  title={`Block ${name}?`}
                  description="They will no longer be able to message you, and you will not see each other in search or venue feeds. You can unblock from your account page."
                  confirmLabel="Block"
                  onConfirm={() =>
                    run(
                      () => blockUser({ data: { userId: profile.id } }),
                      `${name} is blocked.`,
                    )
                  }
                  disabled={busy}
                  className={pillClass("text-xs", { danger: true })}
                >
                  Block
                </ConfirmButton>
              )}
            </div>
          ) : (
            <div className="mt-5">
              <Link to="/account" className={pillClass("text-xs")}>
                Edit your profile
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Mutual connections
          </h2>
          {mutuals.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-5 py-6 text-center text-sm text-muted-foreground">
              No connections in common yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {mutuals.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm"
                >
                  <Avatar name={m.display_name} url={m.avatar_url} size="sm" />
                  <Link
                    to="/people/$userId"
                    params={{ userId: m.id }}
                    className="text-sm font-medium text-foreground hover:underline"
                  >
                    {m.display_name?.trim() || "Member"}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Recent reviews
          </h2>
          {reviews.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-5 py-6 text-center text-sm text-muted-foreground">
              No reviews yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {reviews.map((r) => (
                <li
                  key={r.id}
                  className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      to="/venues/$slug"
                      params={{ slug: r.venue_slug }}
                      className="text-sm font-semibold text-foreground hover:underline"
                    >
                      {r.venue_name}
                    </Link>
                    <StarRating rating={r.rating} />
                  </div>
                  {r.comment ? (
                    <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
                      {r.comment}
                    </p>
                  ) : null}
                  <time
                    dateTime={r.created_at}
                    className="mt-1 block text-[11px] text-muted-foreground"
                  >
                    {formatDate(r.created_at)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
