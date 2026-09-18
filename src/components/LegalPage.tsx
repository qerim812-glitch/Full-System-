import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { POLICY_LAST_UPDATED, legalDetailsConfigured } from "../lib/legal";
import { SiteFooter } from "./SiteFooter";

/**
 * Shared shell for /privacy, /terms and /guidelines.
 *
 * These are public — someone deciding whether to sign up has to be able to
 * read them without an account, which is also why they live outside `_authed`.
 */
export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            to="/"
            className="flex h-9 shrink-0 items-center whitespace-nowrap rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Social Circle
          </Link>
          <Link
            to="/login"
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated {POLICY_LAST_UPDATED}
        </p>
        <p className="mt-6 text-base text-muted-foreground">{intro}</p>

        {/* A placeholder left in src/lib/legal.ts would otherwise be published
            verbatim on a public policy page. Flagged loudly, in development
            only, so it cannot quietly ship. */}
        {!legalDetailsConfigured() && import.meta.env.DEV ? (
          <p className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <strong>Not ready to publish.</strong> The operator name, address
            and contact email are still placeholders — set them in{" "}
            <code>src/lib/legal.ts</code>.
          </p>
        ) : null}

        <div className="mt-8 flex flex-col gap-8">{children}</div>
      </main>

      <SiteFooter />
    </div>
  );
}

/** One numbered section of a policy. */
export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-foreground">{heading}</h2>
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_strong]:font-semibold [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

/** Bulleted list with the spacing the policy pages use. */
export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}
