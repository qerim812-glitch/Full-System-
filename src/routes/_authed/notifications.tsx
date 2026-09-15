import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  Bell,
  CalendarCheck,
  EyeOff,
  MapPin,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ConfirmButton } from "../../components/ConfirmButton";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader, RouteError, pillClass } from "../../components/PageChrome";
import {
  clearNotifications,
  fetchNotifications,
  markNotificationsRead,
  type NotificationKind,
} from "../../lib/notifications";
import { pageHead } from "../../lib/seo";
import { cn, formatRelative } from "../../lib/utils";

export const Route = createFileRoute("/_authed/notifications")({
  loader: async () => ({ notifications: await fetchNotifications() }),
  head: () => pageHead("Notifications", undefined, { noindex: true }),
  errorComponent: () => <RouteError title="Could not load notifications" />,
  component: NotificationsPage,
});

const ICONS: Record<NotificationKind, typeof Bell> = {
  connection_request: UserPlus,
  connection_accepted: UserCheck,
  booking_updated: CalendarCheck,
  connection_checkin: MapPin,
  review_hidden: EyeOff,
  system: Bell,
};

function NotificationsPage() {
  const { notifications } = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const unread = notifications.filter((n) => !n.read_at).length;

  // Opening the page marks everything as read (the badge goes to zero).
  useEffect(() => {
    if (unread === 0) return;
    void markNotificationsRead({ data: {} }).then(() => router.invalidate());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleClear() {
    setBusy(true);
    try {
      const result = await clearNotifications();
      if (!result.ok) toast.error("Could not clear notifications.");
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Notifications"
        subtitle="Connection requests, plans from your connections and booking updates."
        actions={
          notifications.length > 0 ? (
            <ConfirmButton
              title="Clear all notifications?"
              description="This removes every notification from the list."
              confirmLabel="Clear"
              onConfirm={handleClear}
              disabled={busy}
              className={pillClass("text-xs")}
              destructive={false}
            >
              Clear all
            </ConfirmButton>
          ) : null
        }
      />

      {notifications.length === 0 ? (
        <EmptyState
          title="You're all caught up"
          body="New activity from your connections and bookings will appear here."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {notifications.map((n) => {
            const Icon = ICONS[n.kind] ?? Bell;
            const inner = (
              <>
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                    n.read_at
                      ? "bg-muted text-muted-foreground"
                      : "bg-accent text-accent-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-sm text-foreground",
                      !n.read_at && "font-semibold",
                    )}
                  >
                    {n.title}
                  </span>
                  {n.body ? (
                    <span className="block text-xs text-muted-foreground">
                      {n.body}
                    </span>
                  ) : null}
                </span>
                <time
                  dateTime={n.created_at}
                  className="shrink-0 text-[11px] text-muted-foreground"
                >
                  {formatRelative(n.created_at)}
                </time>
              </>
            );
            const className = cn(
              "flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-3 shadow-sm",
              n.link && "transition-all hover:border-foreground/20",
            );
            return (
              <li key={n.id}>
                {n.link ? (
                  <Link to={n.link} className={className}>
                    {inner}
                  </Link>
                ) : (
                  <div className={className}>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
