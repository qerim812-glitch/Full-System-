import { createFileRoute, redirect } from "@tanstack/react-router";

import { fetchAuthUser } from "../lib/auth";

/**
 * The site entry point.
 *
 * NewPop opens on the login screen: a signed-out visitor lands on /login,
 * a signed-in one goes straight to the venue list. This route renders
 * nothing itself, it only decides where you belong.
 *
 * This replaces the previous implementation, which imported
 * public/index.html with Vite's ?raw suffix and returned it as a string —
 * bypassing React entirely.
 */
export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const user = await fetchAuthUser();
    throw redirect({ to: user ? "/venues" : "/login" });
  },
});
