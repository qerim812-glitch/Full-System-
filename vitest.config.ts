/**
 * Standalone Vitest config — deliberately NOT @lovable.dev/vite-tanstack-config.
 *
 * That wrapper bundles tanstackStart and nitro, which try to build a server
 * entry; under Vitest that fails before any test runs. All this needs is
 * tsconfig path resolution so `@/*` imports resolve as they do in the app,
 * which Vite 8 handles natively (no vite-tsconfig-paths plugin required).
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],

    /**
     * src/lib/env.ts validates at module scope and throws when these are
     * absent. Anything importing a data layer pulls it in transitively, so
     * without these a test that only parses a zod schema fails at import.
     *
     * These are placeholders, never used to reach a real project: unit tests
     * cover schemas and pure mappers, not live Supabase calls. Behaviour that
     * depends on the database is verified against a real project instead.
     */
    env: {
      VITE_SUPABASE_URL: "http://localhost:54321",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
    },
  },
});
