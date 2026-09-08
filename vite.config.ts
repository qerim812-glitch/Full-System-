// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },

  // Deploy target is Vercel.
  //
  // The wrapper defaults nitro to the cloudflare-module preset, which is why
  // builds previously emitted wrangler.json and .wrangler/. Nitro's own
  // auto-detection would already pick Vercel when running inside Vercel CI,
  // but pinning it means a local `bun run build` produces the same output we
  // deploy, so the target is verifiable here rather than only in CI.
  //
  // Note: inside a Lovable build LOVABLE_NITRO_PRESET pins Cloudflare and
  // overrides this, so Lovable previews stay on Cloudflare.
  nitro: { preset: "vercel" },
});
