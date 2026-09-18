import { SITE_URL } from "./seo";

/**
 * The pages a signed-out visitor — and therefore a crawler — can actually
 * reach. Everything else in the app sits behind `_authed` and redirects to
 * /login, so listing it would only waste crawl budget.
 *
 * `changefreq`/`priority` are advisory and widely ignored, but `lastmod` is
 * used, so the policy pages carry the date their text last changed.
 */
export const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/privacy",
  "/terms",
  "/guidelines",
] as const;

/**
 * The origin to build absolute URLs from.
 *
 * Prefers the configured VITE_SITE_URL, because behind a proxy the request
 * host can be an internal one. Falls back to the request's own origin so
 * robots.txt and sitemap.xml are still correct on a preview deployment where
 * nobody set the variable.
 */
export function siteOrigin(request: Request): string {
  if (SITE_URL) return SITE_URL;
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return new URL(request.url).origin;
}
