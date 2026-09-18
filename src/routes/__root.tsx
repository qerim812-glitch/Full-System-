import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { Toaster } from "../components/ui/sonner";
import { THEME_INIT_SCRIPT } from "../hooks/use-theme";
import { DEFAULT_LOCALE, LocaleProvider, getLocale } from "../i18n";
import { DEFAULT_OG_IMAGE, SITE_NAME, absoluteUrl } from "../lib/seo";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          Page not found
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back
          home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    // Resolved on the server from the cookie, so the markup, <html lang> and
    // the browser all agree on the language from the first byte.
    beforeLoad: async () => ({ locale: await getLocale() }),
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        {
          name: "viewport",
          // viewport-fit=cover lets the bottom nav read
          // env(safe-area-inset-bottom) and clear the iPhone home indicator.
          content: "width=device-width, initial-scale=1, viewport-fit=cover",
        },
        { title: "Social Circle · Book a table across Tirana" },
        {
          name: "description",
          content:
            "Reserve a table at cafés and lounges across Tirana — Mulliri, Moncherie, Le Chateau, Komiteti and more.",
        },
        { property: "og:title", content: "Social Circle" },
        {
          property: "og:description",
          content: "Reserve a table at cafés and lounges across Tirana.",
        },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: SITE_NAME },
        { name: "twitter:card", content: "summary_large_image" },
        // Absolute, because the platforms that render a preview fetch the
        // image from their own servers. Omitted when VITE_SITE_URL is unset —
        // a broken image tag previews worse than none.
        ...(absoluteUrl(DEFAULT_OG_IMAGE)
          ? [
              {
                property: "og:image",
                content: absoluteUrl(DEFAULT_OG_IMAGE) as string,
              },
              {
                name: "twitter:image",
                content: absoluteUrl(DEFAULT_OG_IMAGE) as string,
              },
              { property: "og:image:width", content: "1200" },
              { property: "og:image:height", content: "630" },
              {
                property: "og:image:alt",
                content: "Social Circle — book a table across Tirana",
              },
            ]
          : []),
        { name: "theme-color", content: "#232633" },
      ],
      links: [
        {
          rel: "stylesheet",
          href: appCss,
        },
        { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
        { rel: "manifest", href: "/manifest.webmanifest" },
        { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
      ],
      // Runs before hydration so the saved theme applies with no flash.
      scripts: [{ children: THEME_INIT_SCRIPT }],
    }),
    shellComponent: RootShell,
    component: RootComponent,
    notFoundComponent: NotFoundComponent,
    errorComponent: ErrorComponent,
  },
);

function RootShell({ children }: { children: ReactNode }) {
  // The shell renders outside the route context, so the locale is read from
  // the matched root context rather than useLocale().
  const locale = Route.useRouteContext({
    select: (context) => context.locale ?? DEFAULT_LOCALE,
  });
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient, locale } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Locale by context, never a mutable global — see src/i18n. */}
      <LocaleProvider locale={locale ?? DEFAULT_LOCALE}>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        {/* Mounted once here so toast() works anywhere. Without it every
            toast call silently does nothing. */}
        <Toaster />
      </LocaleProvider>
    </QueryClientProvider>
  );
}
