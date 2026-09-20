import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  ChevronRight,
  Heart,
  LogOut,
  Moon,
  Shield,
  Sun,
  Users,
} from "lucide-react";

import { useTheme } from "../hooks/use-theme";
import { useT } from "../i18n";
import { LanguageToggle } from "./LanguageToggle";

/**
 * The destinations that do not fit in the phone nav.
 *
 * The bottom bar holds four sections plus the profile, and the top bar holds
 * notifications and messages. Everything else — bookings, favourites, donate,
 * admin, theme, language, and sign out — lives here, on the Account tab.
 * Without this they would simply be unreachable on a phone.
 *
 * Shown only below `md`; on wider screens the sidebar already has them.
 */
const LINKS = [
  { to: "/people", key: "nav.people", Icon: Users },
  { to: "/bookings", key: "nav.bookings", Icon: CalendarDays },
  { to: "/favourites", key: "nav.favourites", Icon: Heart },
] as const;

export function AccountLinks({
  isAdmin,
  onSignOut,
}: {
  isAdmin: boolean;
  onSignOut: () => void | Promise<void>;
}) {
  const t = useT();
  const [dark, setDark] = useTheme();

  return (
    <section className="flex flex-col gap-3 md:hidden">
      <nav
        aria-label={t("nav.primary")}
        className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
      >
        <ul className="divide-y divide-border">
          {LINKS.map(({ to, key, Icon }) => (
            <li key={to}>
              <Link
                to={to}
                // min-h-14 keeps every row a comfortable thumb target.
                className="flex min-h-14 items-center gap-3 px-5 py-3.5 text-sm text-foreground transition-colors active:bg-muted"
              >
                <Icon
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="flex-1">{t(key)}</span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </Link>
            </li>
          ))}

          <li>
            <Link
              to="/donate"
              className="flex min-h-14 items-center gap-3 px-5 py-3.5 text-sm text-foreground transition-colors active:bg-muted"
            >
              <Heart
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span className="flex-1">{t("nav.donate")}</span>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </Link>
          </li>

          {isAdmin ? (
            <li>
              <Link
                to="/admin"
                className="flex min-h-14 items-center gap-3 px-5 py-3.5 text-sm text-foreground transition-colors active:bg-muted"
              >
                <Shield
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="flex-1">{t("nav.admin")}</span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </Link>
            </li>
          ) : null}
        </ul>
      </nav>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex min-h-14 items-center justify-between gap-3 px-5 py-3">
          <span className="text-sm text-foreground">{t("language.label")}</span>
          <LanguageToggle />
        </div>
        <button
          type="button"
          onClick={() => setDark(!dark)}
          aria-pressed={dark}
          className="flex min-h-14 w-full items-center gap-3 border-t border-border px-5 py-3.5 text-sm text-foreground transition-colors active:bg-muted"
        >
          {dark ? (
            <Sun
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
          ) : (
            <Moon
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
          )}
          <span className="flex-1 text-left">
            {dark ? t("theme.toLight") : t("theme.toDark")}
          </span>
        </button>
      </div>

      <button
        type="button"
        onClick={() => void onSignOut()}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-border bg-card text-sm font-medium text-muted-foreground shadow-sm transition-colors active:text-foreground"
      >
        <LogOut className="h-4 w-4" aria-hidden />
        {t("nav.signOut")}
      </button>
    </section>
  );
}
