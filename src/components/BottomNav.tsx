import { Link } from "@tanstack/react-router";

import { useT } from "../i18n";
import { Avatar } from "./Avatar";
import { BOTTOM_ITEMS } from "./nav-items";

/**
 * Phone navigation: an Instagram-style bottom bar.
 *
 * Icons only, no captions — five 24px glyphs read faster than five labels
 * at 10px, and the active one is drawn with a heavier stroke so the current
 * section is still obvious. Each link carries its name as `aria-label`, so
 * screen readers get the words the eye does not need.
 *
 * Four sections plus the profile avatar as the fifth tab. Messages and
 * notifications sit in the phone top bar instead (see `_authed.tsx`);
 * everything else — bookings, favourites, donate, admin — is on the Account
 * page, one tap behind the avatar.
 */
const tabClass =
  "relative flex h-12 flex-1 items-center justify-center text-foreground transition-transform active:scale-90 [&.active_svg]:stroke-[2.5] [&.active_.avatar-ring]:ring-2";

export function BottomNav({
  profileName,
  profileAvatarUrl,
}: {
  profileName: string;
  profileAvatarUrl: string | null;
}) {
  const t = useT();

  return (
    <nav
      aria-label={t("nav.primary")}
      // pb-[env(...)] keeps the row clear of the iPhone home indicator; needs
      // viewport-fit=cover on the viewport meta or the inset reads as 0.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch px-2">
        {BOTTOM_ITEMS.map(({ to, key, Icon }) => (
          <li key={to} className="flex flex-1">
            <Link
              to={to}
              className={tabClass}
              aria-label={t(key)}
              activeOptions={{ exact: false }}
            >
              <Icon className="h-6 w-6" aria-hidden />
            </Link>
          </li>
        ))}
        <li className="flex flex-1">
          <Link
            to="/account"
            className={tabClass}
            aria-label={t("nav.account")}
            activeOptions={{ exact: false }}
          >
            <span className="avatar-ring rounded-full ring-foreground ring-offset-2 ring-offset-background">
              <Avatar name={profileName} url={profileAvatarUrl} size="xs" />
            </span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}
