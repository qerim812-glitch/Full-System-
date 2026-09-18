import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { initClientMonitoring } from "./lib/monitoring";

export const getRouter = () => {
  // Browser only: the server has its own init in server.ts, and @sentry/react
  // has no business being pulled into the SSR bundle.
  if (typeof window !== "undefined") void initClientMonitoring();

  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
