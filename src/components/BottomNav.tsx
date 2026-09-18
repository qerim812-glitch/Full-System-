import { Link } from "@tanstack/react-router";
import {
  CalendarCheck,
  Compass,
  MessageCircle,
  Store,
  User,
} from "lucide-react";

import { useT } from "../i18n";
import { cn } from "../lib/utils";

/**
 * Phone navigation.
 *
 * Replaces the slide-out sheet that used to sit behind a hamburger. A sheet
 * costs two interactions to reach anything (open, then tap) and hides where
 * you are; a bottom bar is one tap and shows the current section at all times.
 * It also puts the targets at the bottom of the screen, which is the part of a
 * phone a thumb can actually reach.
 *
 * Five destinations, because six stops being tappable at 320px. The rest —
 * favourites, people, donate, admin — live on the Account page, which is the
 * fifth tab, so nothing became unreachable.
 */
const TABS = [
  { to: "/feed", key: "nav.feed", Icon: Compass },
  { to: "/venues", key: "nav.venues", Icon: Store },
  { to: "/meetups", key: "nav.meetups", Icon: CalendarCheck },
  { to: "/messages", key: "nav.messages", Icon: MessageCircle },
  { to: "/account", key: "nav.account", Icon: User },
] as const;

export function BottomNav({ dmUnread }: { dmUnread: number }) {
  const t = useT();

  return (
    <nav
      aria-label={t("nav.primary")}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm md:hidden",
        // Keeps the row clear of the iPhone home indicator. Needs
        // viewport-fit=cover on the viewport meta or the inset reads as 0.
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {TABS.map(({ to, key, Icon }) => (
          <li key={to} className="flex-1">
            <Link
              to={to}
              // 56px tall: comfortably above the 44px minimum touch target,
              // and the whole cell is the target rather than just the icon.
              className="relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-muted-foreground transition-colors [&.active]:text-foreground"
              activeOptions={{ exact: false }}
            >
              <span className="relative">
                <Icon className="h-5 w-5" aria-hidden />
                {to === "/messages" && dmUnread > 0 ? (
                  <span
                    className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground"
                    aria-hidden
                  >
                    {dmUnread > 9 ? "9+" : dmUnread}
                  </span>
                ) : null}
              </span>
              <span className="truncate text-[10px] font-medium leading-none">
                {t(key)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
