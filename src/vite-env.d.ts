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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
