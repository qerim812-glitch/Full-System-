import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useRouter,
} from "@tanstack/react-router";

import { fetchAuthUser, signOut } from "../lib/auth";

/**
 * Pathless layout guarding every signed-in route.
 *
 * The guard runs in beforeLoad on the SERVER, and fetchAuthUser verifies the
 * JWT with Supabase rather than trusting the cookie's contents. A child route
 * therefore cannot render at all without a valid session — the check is not a
 * component that could be skipped by rendering the child directly.
 *
 * The verified user is returned into route context, so children read it
 * without re-fetching.
 */
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

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    await router.invalidate();
    await router.navigate({ to: "/login" });
  }

  return (
    /* Full-bleed cream canvas — no inner max-width on the shell */
    <div className="flex min-h-screen flex-col bg-background">

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-6 py-4">

          {/* Brand pill — dark charcoal, matches the "×" close button in the ref */}
          <Link
            to="/venues"
            className="flex h-10 shrink-0 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            NewPop
          </Link>

          {/* Pill nav tabs — the horizontal row in the reference UI */}
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

          {/* User + sign-out — right side */}
          <div className="ml-auto flex shrink-0 items-center gap-2">
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
