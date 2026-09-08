import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useRouter,
} from "@tanstack/react-router";

import { Button } from "../components/ui/button";
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
  { to: "/bookings", label: "My bookings" },
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
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-6 px-4 py-3">
          <Link to="/venues" className="flex flex-col leading-none">
            <span className="text-base font-semibold tracking-tight text-foreground">
              NewPop
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Tirana
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&.active]:bg-accent [&.active]:text-foreground [&.active]:font-medium"
              >
                {item.label}
              </Link>
            ))}
            {user.isAdmin ? (
              <Link
                to="/admin"
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&.active]:bg-accent [&.active]:text-foreground [&.active]:font-medium"
              >
                Admin
              </Link>
            ) : null}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {user.email}
            </span>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-border py-6">
        <p className="mx-auto max-w-5xl px-4 text-xs text-muted-foreground">
          NewPop · Book a table across Tirana
        </p>
      </footer>
    </div>
  );
}
