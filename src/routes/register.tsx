import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { AuthLayout } from "../components/AuthLayout";
import { Alert, AlertDescription } from "../components/ui/alert";
import { fetchAuthUser, signUp } from "../lib/auth";
import { pageHead } from "../lib/seo";

const searchSchema = z.object({
  ref: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]{4,16}$/)
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/register")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () =>
    pageHead("Create account", "Join Social Circle — for ages 18 and over."),
  beforeLoad: async () => {
    const user = await fetchAuthUser();
    if (user) throw redirect({ to: "/feed" });
  },
  component: RegisterPage,
});

function maxDobToday(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 18);
  return d.toISOString().slice(0, 10);
}

function passwordStrength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  const labels = ["Too short", "Weak", "Fair", "Good", "Strong", "Very strong"];
  return { score, label: labels[score] ?? "Weak" };
}

const strengthColors = [
  "bg-destructive",
  "bg-destructive",
  "bg-orange-400",
  "bg-yellow-400",
  "bg-green-500",
  "bg-green-600",
];

function RegisterPage() {
  const router = useRouter();
  const { ref } = Route.useSearch();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const strength = passwordStrength(password);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (!dateOfBirth) {
      setError("Enter your date of birth");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const result = await signUp({
        data: {
          email,
          password,
          dateOfBirth,
          displayName: displayName.trim() || undefined,
          referralCode: ref,
        },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.needsConfirmation) {
        setNotice(
          "Check your email to confirm your address, then sign in. The link expires in an hour.",
        );
        return;
      }
      await router.invalidate();
      await router.navigate({ to: "/feed" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(
        /at least 18/i.test(message)
          ? "You must be at least 18 to join Social Circle."
          : "Please check the form and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (notice) {
    return (
      <AuthLayout
        title="Almost there"
        subtitle="One more step to finish signing up."
      >
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
        <Link
          to="/login"
          className="mt-4 block w-full rounded-full bg-primary py-2.5 text-center text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Go to sign in
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Social Circle is for ages 18 and over."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Field label="Name" htmlFor="displayName">
          <input
            id="displayName"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How others will see you"
            className={inputCls}
          />
        </Field>

        <Field label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={inputCls}
          />
        </Field>

        <Field
          label="Date of birth"
          htmlFor="dateOfBirth"
          hint="Used to check venue age limits."
        >
          <input
            id="dateOfBirth"
            type="date"
            required
            max={maxDobToday()}
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            className={inputCls}
          />
        </Field>

        <Field label="Password" htmlFor="password">
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
          />
          {password ? (
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${strengthColors[strength.score] ?? "bg-muted"}`}
                  style={{ width: `${(strength.score / 5) * 100}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {strength.label}
              </span>
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              At least 8 characters.
            </p>
          )}
        </Field>

        <Field label="Confirm password" htmlFor="confirm">
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputCls}
          />
        </Field>

        {/* Notice rather than a tick box: the processing here is necessary to
            provide the account, so it rests on contract, not consent — and a
            checkbox implying otherwise would be misleading. The links must be
            reachable before signing up, which is why the policies are public
            routes. */}
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          By creating an account you confirm you are 18 or over and agree to our{" "}
          <Link
            to="/terms"
            className="font-medium text-foreground underline underline-offset-2"
          >
            terms
          </Link>
          ,{" "}
          <Link
            to="/privacy"
            className="font-medium text-foreground underline underline-offset-2"
          >
            privacy policy
          </Link>{" "}
          and{" "}
          <Link
            to="/guidelines"
            className="font-medium text-foreground underline underline-offset-2"
          >
            community guidelines
          </Link>
          .
        </p>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          to="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}

const inputCls =
  "h-10 w-full rounded-xl border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium text-muted-foreground"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
