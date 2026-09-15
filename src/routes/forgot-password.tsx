import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "../components/ui/alert";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { AuthLayout } from "../components/AuthLayout";
import { fetchAuthUser, requestPasswordReset } from "../lib/auth";
import { pageHead } from "../lib/seo";

export const Route = createFileRoute("/forgot-password")({
  head: () => pageHead("Reset password"),
  beforeLoad: async () => {
    const user = await fetchAuthUser();
    if (user) throw redirect({ to: "/account" });
  },
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setMessage(null);
      toast.error("Enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      const result = await requestPasswordReset({ data: { email } });
      setMessage(result.message);
    } catch {
      setMessage("If that email has an account, a reset link is on its way.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Reset password"
      subtitle="Enter your email and we'll send a reset link."
    >
      {message ? (
        <div className="flex flex-col gap-5">
          {/* Success state — accent card */}
          <div className="rounded-2xl bg-accent px-5 py-4">
            <div className="mb-2 flex items-center gap-2">
              <svg
                className="h-4 w-4 shrink-0 text-accent-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
              <span className="text-sm font-semibold text-accent-foreground">
                Check your inbox
              </span>
            </div>
            <p className="text-sm text-accent-foreground/80">{message}</p>
          </div>

          <Link
            to="/login"
            className="w-full rounded-full bg-primary py-2.5 text-center text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-5"
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className="text-xs font-medium">
              Email address
            </Label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-10 w-full rounded-xl border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send reset link"}
          </button>

          <p className="text-center text-sm text-muted-foreground">
            <Link
              to="/login"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
