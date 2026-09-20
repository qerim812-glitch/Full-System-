import type { LucideIcon } from "lucide-react";
import {
  Bell,
  CalendarCheck,
  CalendarDays,
  HandHeart,
  Heart,
  House,
  MessageCircle,
  Search,
  Shield,
  Users,
} from "lucide-react";

/**
 * One list of destinations, shared by the desktop sidebar and the phone
 * bottom bar so the two can never disagree about where things live.
 *
 * Labels are translation keys, resolved at render.
 */
export type NavItem = {
  to:
    | "/feed"
    | "/venues"
    | "/meetups"
    | "/people"
    | "/favourites"
    | "/bookings"
    | "/messages"
    | "/notifications"
    | "/donate"
    | "/admin";
  key: string;
  Icon: LucideIcon;
  /** Which unread counter (if any) this destination shows a badge for. */
  badge?: "dm" | "notifications";
};

/** Everything, in sidebar order. */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: "/feed", key: "nav.feed", Icon: House },
  { to: "/venues", key: "nav.venues", Icon: Search },
  { to: "/meetups", key: "nav.meetups", Icon: CalendarCheck },
  { to: "/people", key: "nav.people", Icon: Users },
  { to: "/messages", key: "nav.messages", Icon: MessageCircle, badge: "dm" },
  {
    to: "/notifications",
    key: "nav.notifications",
    Icon: Bell,
    badge: "notifications",
  },
  { to: "/favourites", key: "nav.favourites", Icon: Heart },
  { to: "/bookings", key: "nav.bookings", Icon: CalendarDays },
  { to: "/donate", key: "nav.donate", Icon: HandHeart },
];

export const ADMIN_ITEM: NavItem = {
  to: "/admin",
  key: "nav.admin",
  Icon: Shield,
};

/**
 * The four that earn a slot in the phone bottom bar (the fifth is the
 * profile avatar). Messages and notifications live in the phone top bar
 * instead, the way Instagram does it.
 */
export const BOTTOM_ITEMS = NAV_ITEMS.filter((item) =>
  ["/feed", "/venues", "/meetups", "/people"].includes(item.to),
);

/** Cap shown in a badge; anything larger reads as "a lot" anyway. */
export function badgeText(count: number, max = 99): string {
  return count > max ? `${max}+` : String(count);
}
