import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { Bell, MessageCircle, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { BottomNav } from "../components/BottomNav";
import { Logo } from "../components/Logo";
import { NavBadge } from "../components/NavBadge";
import { SIDENAV_OFFSET, SideNav } from "../components/SideNav";
import { useRealtime } from "../hooks/use-realtime";
import { useT } from "../i18n";
import { fetchAuthUser, signOut } from "../lib/auth";
import { fetchUnreadCounts, type UnreadCounts } from "../lib/notifications";
import { fetchOwnedVenueSlugs } from "../lib/owner";
import { fetchMyProfile } from "../lib/profile";
import { cn } from "../lib/utils";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ location }) => {
    const user = await fetchAuthUser();
    if (!user) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    return { user };
  },
  // The nav shows the member's avatar as the profile tab. Loaded once here
  // rather than on every page; `staleTime` keeps it from refetching on each
  // navigation, and the Account page's `router.invalidate()` after an avatar
  // change refreshes it at once.
  loader: async () => {
    const [profile, ownedSlugs] = await Promise.all([
      fetchMyProfile(),
      fetchOwnedVenueSlugs(),
    ]);
    return {
      profileName: profile?.display_name ?? null,
      profileAvatarUrl: profile?.avatar_url ?? null,
      isOwner: ownedSlugs.length > 0,
    };
  },
  staleTime: 5 * 60_000,
  component: AuthedLayout,
});

const POLL_MS = 30_000;

/**
 * Unread DM + notification counts for the header. One cheap RPC, refreshed
 * every 30 s while the tab is visible and after every navigation (so reading
 * a thread clears the badge immediately instead of up to 30 s later).
 */
function useUnreadCounts(): UnreadCounts {
  const [counts, setCounts] = useState<UnreadCounts>({
    dmUnread: 0,
    notificationsUnread: 0,
  });
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Stable identity so useRealtime does not resubscribe on every render.
  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      setCounts(await fetchUnreadCounts());
    } catch {
      // Badge just won't update this tick.
    }
  }, []);

  // Refetch after every navigation, so reading a thread clears the badge at
  // once rather than on the next tick.
  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  // Both badges come from unread_counts(), so each source table gets a
  // subscription. useRealtime keeps a 30s poll as the floor and only backs off
  // to 60s once the socket reports SUBSCRIBED — so this is strictly faster
  // than the old fixed 30s poll, and never slower.
  useRealtime({
    table: "notifications",
    onChange: () => void refresh(),
    fallbackMs: POLL_MS,
  });
  useRealtime({
    table: "direct_messages",
    onChange: () => void refresh(),
    fallbackMs: POLL_MS,
  });

  return counts;
}

const topIcon =
  "relative flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-transform active:scale-90 [&.active_svg]:stroke-[2.5]";

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const { profileName, profileAvatarUrl, isOwner } = Route.useLoaderData();
  const t = useT();
  const router = useRouter();
  const { dmUnread, notificationsUnread } = useUnreadCounts();

  async function handleSignOut() {
    await signOut();
    await router.invalidate();
    await router.navigate({ to: "/login" });
  }

  const name = profileName ?? user.email;

  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        {t("nav.skip")}
      </a>

      {/* Desktop: fixed left rail with every destination, profile and More. */}
      <SideNav
        dmUnread={dmUnread}
        notificationsUnread={notificationsUnread}
        isAdmin={user.isAdmin}
        isOwner={isOwner}
        profileName={name}
        profileAvatarUrl={profileAvatarUrl}
        onSignOut={handleSignOut}
      />

      <div className={cn("flex min-h-dvh flex-col", SIDENAV_OFFSET)}>
        {/* Phone: slim top bar — wordmark left, notifications and messages
            right, the way Instagram lays it out. The sections themselves are
            in the bottom bar. */}
        <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-sm md:hidden">
          <div className="mx-auto flex h-14 w-full max-w-lg items-center justify-between pl-4 pr-2">
            <Link
              to="/feed"
              className="flex items-center text-foreground"
              aria-label={t("nav.home")}
            >
              <Logo
                markClassName="h-6 w-6"
                className="text-lg font-semibold tracking-tight"
              />
            </Link>

            <div className="flex items-center">
              <Link
                to="/search"
                className={topIcon}
                activeOptions={{ exact: false }}
                aria-label={t("nav.search")}
              >
                <Search className="h-6 w-6" aria-hidden />
              </Link>
              <Link
                to="/notifications"
                className={topIcon}
                activeOptions={{ exact: false }}
                aria-label={
                  notificationsUnread > 0
                    ? t("nav.notificationsUnread", {
                        count: notificationsUnread,
                      })
                    : t("nav.notifications")
                }
              >
                <Bell className="h-6 w-6" aria-hidden />
                <NavBadge
                  count={notificationsUnread}
                  className="right-0.5 top-1"
                />
              </Link>
              <Link
                to="/messages"
                className={topIcon}
                activeOptions={{ exact: false }}
                aria-label={
                  dmUnread > 0
                    ? t("nav.messagesUnread", { count: dmUnread })
                    : t("nav.messages")
                }
              >
                <MessageCircle className="h-6 w-6" aria-hidden />
                <NavBadge count={dmUnread} className="right-0.5 top-1" />
              </Link>
            </div>
          </div>
        </header>

        <main
          id="main"
          // pb-24 on phones keeps the last element clear of the fixed bottom
          // bar; md: drops it because the bar is hidden there.
          className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-4 sm:px-6 md:pb-8 md:pt-8"
        >
          <Outlet />
        </main>
      </div>

      <BottomNav profileName={name} profileAvatarUrl={profileAvatarUrl} />
    </div>
  );
}
