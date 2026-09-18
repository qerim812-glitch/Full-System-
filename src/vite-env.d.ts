/// <reference types="vite/client" />

/**
 * Explicit declarations for this project's env vars.
 *
 * Without these, `import.meta.env.VITE_SUPABASE_URL` resolves through Vite's
 * index signature and trips TS4111 under noPropertyAccessFromIndexSignature.
 *
 * Declaring them here rather than switching to bracket notation is
 * deliberate: Vite performs its build-time string substitution only on the
 * literal dot form. `import.meta.env["VITE_SUPABASE_URL"]` type-checks but is
 * never replaced, so it arrives as undefined in the browser bundle.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /**
   * Buy Me a Coffee page handle. Optional: with it unset the /donate page
   * falls back to the manual form instead of linking to a dead page.
   */
  readonly VITE_BMC_USERNAME?: string;
  /**
   * Public origin, no trailing slash (https://socialcircle.al). Required for
   * absolute Open Graph image URLs and for sitemap.xml.
   */
  readonly VITE_SITE_URL?: string;
  /**
   * Sentry DSN. Public by design — it only grants permission to send events.
   * Unset, no monitoring code is downloaded at all.
   */
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  /**
   * VAPID public key for Web Push. Public by design — the browser needs it to
   * subscribe. Unset, the notifications toggle does not render.
   */
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
