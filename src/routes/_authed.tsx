import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "../components/ui/sheet";
import { fetchAuthUser, signOut } from "../lib/auth";
import { fetchDmThreads } from "../lib/messaging";

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

const NAV = [
  { to: "/venues", label: "Venues" },
  { to: "/favourites", label: "Favourites" },
  { to: "/bookings", label: "My Bookings" },
  { to: "/messages", label: "Messages" },
  { to: "/donate", label: "Donate" },
  { to: "/account", label: "Account" },
] as const;

/** Reads / writes the "dark" class on <html> and persists to localStorage. */
function useDarkMode() {
  const [dark, setDark] = useState(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [dark]);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") setDark(true);
    else if (saved === "light") setDark(false);
    else if (window.matchMedia("(prefers-color-scheme: dark)").matches) setDark(true);
  }, []);

  return [dark, setDark] as const;
}

/** Polls unread DM count every 30 s. */
function useUnreadCount() {
  const [count, setCount] = useState(0);

  async function refresh() {
    try {
      const threads = await fetchDmThreads();
      setCount(threads.reduce((s, t) => s + t.unread, 0));
    } catch {
      // Silent — badge just won't update this tick
    }
  }

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(timer);
  }, []);

  return count;
}

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const [dark, setDark] = useDarkMode();
  const unread = useUnreadCount();
  const [sheetOpen, setSheetOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    await router.invalidate();
    await router.navigate({ to: "/login" });
  }

  const allNav = [
    ...NAV,
    ...(user.isAdmin ? [{ to: "/admin" as const, label: "Admin" }] : []),
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-4 sm:px-6">

          {/* Brand pill */}
          <Link
            to="/venues"
            className="flex h-9 shrink-0 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            NewPop
          </Link>

          {/* ── Desktop pill nav — hidden on mobile ─────────────── */}
          <nav className="hidden flex-1 items-center gap-1.5 overflow-x-auto md:flex">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="relative whitespace-nowrap rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground shadow-sm transition-all hover:border-foreground/20 hover:text-foreground [&.active]:border-transparent [&.active]:bg-primary [&.active]:text-primary-foreground [&.active]:shadow-none"
              >
                {item.label}
                {/* Unread badge on Messages */}
                {item.to === "/messages" && unread > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-foreground">
                    {unread}
                  </span>
                )}
              </Link>
            ))}
            {user.isAdmin ? (
              <Link
                to="/admin"
                className="whitespace-nowrap rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground shadow-sm transition-all hover:border-foreground/20 hover:text-foreground [&.active]:border-transparent [&.active]:bg-primary [&.active]:text-primary-foreground [&.active]:shadow-none"
              >
                Admin
              </Link>
            ) : null}
          </nav>

          {/* ── Right side controls ──────────────────────────────── */}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* Dark mode toggle */}
            <button
              onClick={() => setDark(!dark)}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-all hover:border-foreground/20 hover:text-foreground"
            >
              {dark ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="5" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>

            {/* Email label — desktop only */}
            <span className="hidden max-w-[10rem] truncate text-xs text-muted-foreground lg:inline">
              {user.email}
            </span>

            {/* Sign out — desktop only */}
            <button
              onClick={handleSignOut}
              className="hidden rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-all hover:border-foreground/20 hover:text-foreground md:flex"
            >
              Sign out
            </button>

            {/* ── Hamburger — mobile only ─────────────────────── */}
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <button
                  aria-label="Open menu"
                  className="relative flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-all hover:border-foreground/20 hover:text-foreground md:hidden"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                  {/* Unread dot on hamburger */}
                  {unread > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent" />
                  )}
                </button>
              </SheetTrigger>

              {/* ── Slide-in sheet ────────────────────────────── */}
              <SheetContent side="right" className="flex w-72 flex-col gap-0 p-0">
                {/* Sheet header */}
                <div className="border-b border-border px-6 py-5">
                  <p className="text-base font-semibold text-foreground">NewPop</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{user.email}</p>
                </div>

                {/* Nav links */}
                <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-4">
                  {allNav.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setSheetOpen(false)}
                      className="flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground [&.active]:bg-primary [&.active]:text-primary-foreground"
                    >
                      <span>{item.label}</span>
                      {item.to === "/messages" && unread > 0 && (
                        <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-foreground">
                          {unread}
                        </span>
                      )}
                    </Link>
                  ))}
                </nav>

                {/* Sheet footer */}
                <div className="border-t border-border px-4 py-4">
                  <button
                    onClick={handleSignOut}
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

      {/* ── Page content ────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
