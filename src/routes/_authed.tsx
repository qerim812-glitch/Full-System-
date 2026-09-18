import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { Bell, LogOut, Menu, Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "../components/ui/sheet";
import { LanguageToggle } from "../components/LanguageToggle";
import { useRealtime } from "../hooks/use-realtime";
import { useT } from "../i18n";
import { useTheme } from "../hooks/use-theme";
import { fetchAuthUser, signOut } from "../lib/auth";
import { fetchUnreadCounts, type UnreadCounts } from "../lib/notifications";
import { cn } from "../lib/utils";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ location }) => {
    const user = await fetchAuthUser();
    if (!user) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    return { user };
  },
  component: AuthedLayout,
});

// Labels are translation keys, resolved at render — a literal here would
// bake English into the nav whatever the locale says.
const NAV = [
  { to: "/feed", key: "nav.feed" },
  { to: "/venues", key: "nav.venues" },
  { to: "/meetups", key: "nav.meetups" },
  { to: "/favourites", key: "nav.favourites" },
  { to: "/bookings", key: "nav.bookings" },
  { to: "/people", key: "nav.people" },
  { to: "/messages", key: "nav.messages" },
  { to: "/donate", key: "nav.donate" },
  { to: "/account", key: "nav.account" },
] as const;

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

const pillNav =
  "relative inline-flex min-h-9 items-center whitespace-nowrap rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground shadow-sm transition-all hover:border-foreground/20 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&.active]:border-transparent [&.active]:bg-primary [&.active]:text-primary-foreground [&.active]:shadow-none";
const iconButton =
  "relative flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-all hover:border-foreground/20 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function Badge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const t = useT();
  const router = useRouter();
  const [dark, setDark] = useTheme();
  const { dmUnread, notificationsUnread } = useUnreadCounts();
  const [sheetOpen, setSheetOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    await router.invalidate();
    await router.navigate({ to: "/login" });
  }

  const allNav = [
    ...NAV,
    ...(user.isAdmin ? [{ to: "/admin" as const, key: "nav.admin" }] : []),
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        {t("nav.skip")}
      </a>

      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-4 sm:px-6">
          <Link
            to="/feed"
            className="flex h-9 shrink-0 items-center whitespace-nowrap rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            aria-label={t("nav.home")}
          >
            Social Circle
          </Link>

          <nav
            className="hidden flex-1 items-center gap-1.5 overflow-x-auto md:flex"
            aria-label={t("nav.primary")}
          >
            {allNav.map((item) => (
              <Link key={item.to} to={item.to} className={pillNav}>
                {t(item.key)}
                {item.to === "/messages" ? <Badge count={dmUnread} /> : null}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link
              to="/notifications"
              className={cn(
                iconButton,
                "[&.active]:border-transparent [&.active]:bg-primary [&.active]:text-primary-foreground",
              )}
              aria-label={
                notificationsUnread > 0
                  ? t("nav.notificationsUnread", { count: notificationsUnread })
                  : t("nav.notifications")
              }
            >
              <Bell className="h-4 w-4" aria-hidden />
              <Badge count={notificationsUnread} />
            </Link>

            <button
              type="button"
              onClick={() => setDark(!dark)}
              aria-label={dark ? t("theme.toLight") : t("theme.toDark")}
              aria-pressed={dark}
              className={iconButton}
            >
              {dark ? (
                <Sun className="h-4 w-4" aria-hidden />
              ) : (
                <Moon className="h-4 w-4" aria-hidden />
              )}
            </button>

            <LanguageToggle className="hidden sm:flex" />

            <span className="hidden max-w-[10rem] truncate text-xs text-muted-foreground lg:inline">
              {user.email}
            </span>

            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="hidden min-h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-all hover:border-foreground/20 hover:text-foreground md:flex"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              {t("nav.signOut")}
            </button>

            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label={t("nav.openMenu")}
                  className={cn(iconButton, "md:hidden")}
                >
                  <Menu className="h-4 w-4" aria-hidden />
                  {dmUnread > 0 ? (
                    <span
                      className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent"
                      aria-hidden
                    />
                  ) : null}
                </button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="flex w-72 flex-col gap-0 p-0"
              >
                <div className="border-b border-border px-6 py-5">
                  <SheetTitle className="text-base font-semibold text-foreground">
                    Social Circle
                  </SheetTitle>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {user.email}
                  </p>
                </div>
                <nav
                  className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-4"
                  aria-label="Primary"
                >
                  {allNav.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setSheetOpen(false)}
                      className="flex min-h-11 items-center justify-between rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground [&.active]:bg-primary [&.active]:text-primary-foreground"
                    >
                      <span>{t(item.key)}</span>
                      {item.to === "/messages" && dmUnread > 0 ? (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-foreground">
                          {dmUnread}
                        </span>
                      ) : null}
                    </Link>
                  ))}
                  <Link
                    to="/notifications"
                    onClick={() => setSheetOpen(false)}
                    className="flex min-h-11 items-center justify-between rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground [&.active]:bg-primary [&.active]:text-primary-foreground"
                  >
                    <span>Notifications</span>
                    {notificationsUnread > 0 ? (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-foreground">
                        {notificationsUnread}
                      </span>
                    ) : null}
                  </Link>
                </nav>
                <div className="border-t border-border px-4 py-4">
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    className="w-full rounded-full border border-border py-2 text-sm font-medium text-muted-foreground transition-all hover:border-foreground/20 hover:text-foreground"
                  >
                    Sign out
                  </button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main
        id="main"
        className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6"
      >
        <Outlet />
      </main>
    </div>
  );
}
