/**
 * Per-route <head> helper. Every page gets a distinct title and description
 * (previously only the root defined them, so every tab read the same thing).
 */
export const SITE_NAME = "NewPop";
export const DEFAULT_DESCRIPTION =
  "Reserve a table at cafés and lounges across Tirana.";

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
  if (extra.image) {
    meta.push({ property: "og:image", content: extra.image });
    meta.push({ name: "twitter:image", content: extra.image });
  }
  if (extra.noindex) meta.push({ name: "robots", content: "noindex" });
  return { meta };
}
