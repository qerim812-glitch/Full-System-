/**
 * Per-route <head> helper. Every page gets a distinct title and description
 * (previously only the root defined them, so every tab read the same thing).
 */
export const SITE_NAME = "Social Circle";
export const DEFAULT_DESCRIPTION =
  "Reserve a table at cafés and lounges across Tirana.";

/**
 * The public origin, e.g. https://socialcircle.al — no trailing slash.
 *
 * Needed because Open Graph requires an ABSOLUTE image URL: Facebook, X,
 * WhatsApp and friends fetch the image from their own servers, where a
 * relative "/og-image.png" resolves to nothing. Left unset, the image tags are
 * omitted rather than emitted broken, and links preview with title and
 * description only.
 */
export const SITE_URL = (import.meta.env.VITE_SITE_URL ?? "").replace(
  /\/+$/,
  "",
);

/** The share card generated into public/og-image.png (1200×630). */
export const DEFAULT_OG_IMAGE = "/og-image.png";

/** Relative path → absolute URL, or null when SITE_URL is not configured. */
export function absoluteUrl(path: string): string | null {
  if (!SITE_URL) return null;
  return path.startsWith("http")
    ? path
    : `${SITE_URL}/${path.replace(/^\/+/, "")}`;
}

export function pageHead(
  title: string,
  description: string = DEFAULT_DESCRIPTION,
  extra: { image?: string | null; noindex?: boolean } = {},
) {
  const full = title ? `${title} · ${SITE_NAME}` : SITE_NAME;
  const meta: Array<Record<string, string>> = [
    { title: full },
    { name: "description", content: description },
    { property: "og:title", content: full },
    { property: "og:description", content: description },
    { name: "twitter:title", content: full },
    { name: "twitter:description", content: description },
  ];

  // A page-specific image (a venue photo) wins; otherwise the brand card, so
  // no shared link previews blank.
  const image = absoluteUrl(extra.image ?? DEFAULT_OG_IMAGE);
  if (image) {
    meta.push({ property: "og:image", content: image });
    meta.push({ name: "twitter:image", content: image });
  }

  if (extra.noindex) meta.push({ name: "robots", content: "noindex" });
  return { meta };
}
