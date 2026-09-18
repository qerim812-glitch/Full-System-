import { Link } from "@tanstack/react-router";

import { useT } from "../i18n";

/**
 * The public footer. Carries the policy links, which have to be reachable from
 * every public page — a privacy notice nobody can find does not count as
 * having given notice.
 */
export function SiteFooter() {
  const t = useT();
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-6 text-xs text-muted-foreground sm:px-6">
        <span>© {new Date().getFullYear()} Social Circle · Tirana</span>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
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
          <Link to="/donate" className="hover:text-foreground hover:underline">
            {t("footer.support")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
