import { createFileRoute } from "@tanstack/react-router";

import { PUBLIC_PATHS, siteOrigin } from "../lib/site-map";

/**
 * Served from a route rather than public/robots.txt so the `Sitemap:` line can
 * be an absolute URL — the spec requires one, and a static file cannot know
 * which domain it is being served from.
 */
function robots(request: Request): Response {
  const origin = siteOrigin(request);
  const body = [
    "# Only the signed-out pages are indexable. Everything under the app shell",
    "# requires a session, so a crawler would just be redirected to /login.",
    "User-agent: *",
    ...PUBLIC_PATHS.map((path) => `Allow: ${path === "/" ? "/$" : path}`),
    "Allow: /og-image.png",
    "",
    ...[
      "/venues",
      "/bookings",
      "/messages",
      "/people",
      "/account",
      "/admin",
      "/notifications",
      "/favourites",
      "/donate",
      "/auth/",
      "/api/",
    ].map((path) => `Disallow: ${path}`),
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}

export const Route = createFileRoute("/robots.txt")({
  server: { handlers: { GET: ({ request }) => robots(request) } },
});
