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
  SquarePlus,
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
    | "/new"
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
  { to: "/new", key: "nav.create", Icon: SquarePlus },
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
 * profile avatar), with Create in the middle the way Instagram does it.
 * Messages, notifications and search live in the phone top bar instead.
 */
export const BOTTOM_ITEMS = ["/feed", "/venues", "/new", "/meetups"].map((to) =>
  NAV_ITEMS.find((item) => item.to === to)!,
);

/** Cap shown in a badge; anything larger reads as "a lot" anyway. */
export function badgeText(count: number, max = 99): string {
  return count > max ? `${max}+` : String(count);
}
