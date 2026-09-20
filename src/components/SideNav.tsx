import { Link, useRouter } from "@tanstack/react-router";
import { Check, LogOut, Menu, Moon, Sun } from "lucide-react";
import { useState } from "react";

import {
  LOCALES,
  localeName,
  setLocaleCookie,
  useLocale,
  useT,
  type Locale,
} from "../i18n";
import { useTheme } from "../hooks/use-theme";
import { cn } from "../lib/utils";
import { Avatar } from "./Avatar";
import { LogoMark } from "./Logo";
import { NavBadge } from "./NavBadge";
import { ADMIN_ITEM, NAV_ITEMS } from "./nav-items";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

/**
 * Desktop navigation: a fixed left rail, Instagram-style.
 *
 * Replaces the horizontal row of pills, which had grown to nine items and
 * scrolled sideways on anything narrower than a wide laptop. A vertical rail
 * has room for every destination at once, plus the profile and a "More"
 * menu, and it never runs out of width — below `xl` it collapses to icons
 * (with tooltips via `title`), above it shows icon + label.
 *
 * Width tokens are shared with the layout's left padding: 72px collapsed,
 * 244px expanded.
 */
export const SIDENAV_OFFSET = "md:pl-[72px] xl:pl-[244px]";

const itemClass =
  "group relative flex h-12 w-full items-center gap-4 rounded-xl px-3 text-base text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&.active]:font-bold [&.active_svg]:stroke-[2.5] [&.active_.avatar-ring]:ring-2";

export function SideNav({
  dmUnread,
  notificationsUnread,
  isAdmin,
  profileName,
  profileAvatarUrl,
  onSignOut,
}: {
  dmUnread: number;
  notificationsUnread: number;
  isAdmin: boolean;
  profileName: string;
  profileAvatarUrl: string | null;
  onSignOut: () => void | Promise<void>;
}) {
  const t = useT();
  const items = isAdmin ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col border-r border-border bg-background px-3 pb-5 pt-4 md:flex xl:w-[244px]"
      aria-label={t("nav.primary")}
    >
      <Link
        to="/feed"
        className="mb-4 flex h-12 items-center gap-2 rounded-xl px-3 text-foreground transition-colors hover:bg-muted"
        aria-label={t("nav.home")}
      >
        <LogoMark className="h-7 w-7 shrink-0" />
        <span className="hidden truncate text-lg font-semibold tracking-tight xl:inline">
          Social Circle
        </span>
      </Link>

      <nav className="flex flex-1 flex-col gap-0.5">
        {items.map(({ to, key, Icon, badge }) => {
          const count =
            badge === "dm"
              ? dmUnread
              : badge === "notifications"
                ? notificationsUnread
                : 0;
          return (
            <Link
              key={to}
              to={to}
              className={itemClass}
              title={t(key)}
              activeOptions={{ exact: false }}
            >
              <span className="relative shrink-0">
                <Icon className="h-6 w-6 transition-transform group-hover:scale-105" />
                <NavBadge count={count} />
              </span>
              <span className="hidden truncate xl:inline">
                {t(key)}
                {count > 0 ? (
                  <span className="sr-only">
                    {" "}
                    ({t("nav.unreadCount", { count })})
                  </span>
                ) : null}
              </span>
            </Link>
          );
        })}

        <Link
          to="/account"
          className={itemClass}
          title={t("nav.account")}
          activeOptions={{ exact: false }}
        >
          <span className="avatar-ring shrink-0 rounded-full ring-foreground ring-offset-2 ring-offset-background">
            <Avatar name={profileName} url={profileAvatarUrl} size="xs" />
          </span>
          <span className="hidden truncate xl:inline">{t("nav.account")}</span>
        </Link>
      </nav>

      <MoreMenu onSignOut={onSignOut} />
    </aside>
  );
}

/** Theme, language and sign-out, tucked under "More" like Instagram does. */
function MoreMenu({ onSignOut }: { onSignOut: () => void | Promise<void> }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [dark, setDark] = useTheme();
  const [busy, setBusy] = useState(false);

  async function chooseLocale(next: Locale) {
    if (next === locale || busy) return;
    setBusy(true);
    setLocaleCookie(next);
    try {
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(itemClass, "data-[state=open]:font-bold")}
        title={t("nav.more")}
      >
        <Menu className="h-6 w-6 shrink-0" aria-hidden />
        <span className="hidden truncate xl:inline">{t("nav.more")}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-60 rounded-2xl p-2"
      >
        <DropdownMenuItem
          onSelect={() => setDark(!dark)}
          className="gap-3 rounded-xl px-3 py-2.5 text-sm"
        >
          {dark ? (
            <Sun className="h-4 w-4" aria-hidden />
          ) : (
            <Moon className="h-4 w-4" aria-hidden />
          )}
          {dark ? t("theme.toLight") : t("theme.toDark")}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="px-3 text-xs font-medium text-muted-foreground">
          {t("language.label")}
        </DropdownMenuLabel>
        {LOCALES.map((option) => (
          <DropdownMenuItem
            key={option}
            disabled={busy}
            onSelect={() => void chooseLocale(option)}
            className="gap-3 rounded-xl px-3 py-2.5 text-sm"
            aria-checked={locale === option}
            role="menuitemradio"
          >
            <span className="flex h-4 w-4 items-center justify-center">
              {locale === option ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : null}
            </span>
            {localeName(option)}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => void onSignOut()}
          className="gap-3 rounded-xl px-3 py-2.5 text-sm"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          {t("nav.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
