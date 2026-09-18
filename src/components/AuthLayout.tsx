import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useT } from "../i18n";
import { LanguageToggle } from "./LanguageToggle";
import { Logo } from "./Logo";

/** Shared shell for the signed-out screens (login, register, reset). */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex justify-center">
          <LanguageToggle />
        </div>
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="flex items-center whitespace-nowrap rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">
            <Logo markClassName="h-4 w-4" />
            <span className="ml-1.5 font-normal opacity-70">· Tirana</span>
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-7 shadow-sm">
          {children}
        </div>

        {/* The signed-out screens are outside the site footer, so the policies
            get their own link here — they have to be reachable before anyone
            hands over an email address. */}
        <nav className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <Link
            to="/guidelines"
            className="hover:text-foreground hover:underline"
          >
            {t("footer.guidelines")}
          </Link>
          <Link to="/privacy" className="hover:text-foreground hover:underline">
            {t("footer.privacy")}
          </Link>
          <Link to="/terms" className="hover:text-foreground hover:underline">
            {t("footer.terms")}
          </Link>
        </nav>
      </div>
    </main>
  );
}
