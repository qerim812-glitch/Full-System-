import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { fetchAuthUser, signOut } from "../lib/auth";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ location }) => {
    const user = await fetchAuthUser();
    if (!user) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
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

  // On first mount, restore saved preference
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") setDark(true);
    else if (saved === "light") setDark(false);
    else if (window.matchMedia("(prefers-color-scheme: dark)").matches) setDark(true);
  }, []);

  return [dark, setDark] as const;
}

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const [dark, setDark] = useDarkMode();

  async function handleSignOut() {
    await signOut();
    await router.invalidate();
    await router.navigate({ to: "/login" });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-6 py-4">

          {/* Brand pill */}
          <Link
            to="/venues"
            className="flex h-10 shrink-0 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            NewPop
          </Link>

          {/* Pill nav tabs */}
          <nav className="flex flex-1 items-center gap-1.5 overflow-x-auto">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="whitespace-nowrap rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground shadow-sm transition-all hover:border-foreground/20 hover:text-foreground [&.active]:border-transparent [&.active]:bg-primary [&.active]:text-primary-foreground [&.active]:shadow-none"
              >
                {item.label}
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

          {/* Right side: dark mode toggle + user + sign-out */}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* Dark mode toggle */}
            <button
              onClick={() => setDark(!dark)}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-all hover:border-foreground/20 hover:text-foreground"
            >
              {dark ? (
                /* Sun icon */
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="5" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
              ) : (
                /* Moon icon */
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>

            <span className="hidden max-w-[10rem] truncate text-xs text-muted-foreground sm:inline">
              {user.email}
            </span>
            <button
              onClick={handleSignOut}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-all hover:border-foreground/20 hover:text-foreground"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* ── Page content ────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
