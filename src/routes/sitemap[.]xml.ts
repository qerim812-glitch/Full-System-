import { createFileRoute } from "@tanstack/react-router";

import { POLICY_LAST_UPDATED } from "../lib/legal";
import { PUBLIC_PATHS, siteOrigin } from "../lib/site-map";

/** XML text escaping. A raw & in a URL makes the whole document invalid. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "18 September 2026" → "2026-09-18", the W3C date sitemaps require. */
function isoDate(humanDate: string): string {
  const parsed = new Date(`${humanDate} UTC`);
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString().slice(0, 10)
    : parsed.toISOString().slice(0, 10);
}

function sitemap(request: Request): Response {
  const origin = siteOrigin(request);
  const lastmod = isoDate(POLICY_LAST_UPDATED);

  const urls = PUBLIC_PATHS.map((path) => {
    const priority = path === "/" ? "1.0" : "0.5";
    return [
      "  <url>",
      `    <loc>${escapeXml(origin + path)}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
      `    <priority>${priority}</priority>`,
      "  </url>",
    ].join("\n");
  }).join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}

export const Route = createFileRoute("/sitemap.xml")({
  server: { handlers: { GET: ({ request }) => sitemap(request) } },
});
