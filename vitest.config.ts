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
  },
});
