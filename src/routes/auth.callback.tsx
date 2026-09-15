import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";

import { AuthLayout } from "../components/AuthLayout";
import { exchangeAuthCode } from "../lib/auth";
import { pageHead } from "../lib/seo";
import { safeRedirect } from "../lib/utils";

const searchSchema = z.object({
  code: z.string().optional().catch(undefined),
  next: z.string().optional().catch(undefined),
  error_description: z.string().optional().catch(undefined),
});

/**
 * Landing page for Supabase email links (confirm address, reset password).
 * The exchange runs from the browser so the Set-Cookie headers arrive on a
 * normal fetch response, then we navigate to `next`.
 */
export const Route = createFileRoute("/auth/callback")({
  validateSearch: searchSchema,
  head: () => pageHead("Signing you in", undefined, { noindex: true }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const router = useRouter();
  const { code, next, error_description } = Route.useSearch();
  const [error, setError] = useState<string | null>(error_description ?? null);

  useEffect(() => {
    if (!code || error) return;
    let cancelled = false;
    exchangeAuthCode({ data: { code } })
      .then(async (result) => {
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error);
          return;
        }
        await router.invalidate();
        await router.navigate({ to: safeRedirect(next), replace: true });
      })
      .catch(() => {
        if (!cancelled)
          setError("Could not reach the server. Try the link again.");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (!code && !error) {
    return (
      <AuthLayout
        title="Nothing to do here"
        subtitle="This link is incomplete."
      >
        <Link
          to="/login"
          className="block w-full rounded-full bg-primary py-2.5 text-center text-sm font-semibold text-primary-foreground"
        >
          Go to sign in
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={error ? "Link problem" : "One moment"}
      subtitle={error ? "We could not complete that link." : "Signing you in…"}
    >
      {error ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-destructive">{error}</p>
          <Link
            to="/forgot-password"
            className="block w-full rounded-full bg-primary py-2.5 text-center text-sm font-semibold text-primary-foreground"
          >
            Request a new link
          </Link>
          <Link
            to="/login"
            className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <div className="flex items-center justify-center py-6" role="status">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-foreground" />
          <span className="sr-only">Signing you in</span>
        </div>
      )}
    </AuthLayout>
  );
}
