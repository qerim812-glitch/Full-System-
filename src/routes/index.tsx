import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { CalendarCheck, MessageCircle, ShieldCheck, Users } from "lucide-react";

import { pillClass, primaryPillClass } from "../components/PageChrome";
import { Logo } from "../components/Logo";
import { SiteFooter } from "../components/SiteFooter";
import { VenueCard } from "../components/VenueCard";
import { fetchAuthUser } from "../lib/auth";
import { DEFAULT_DESCRIPTION, pageHead } from "../lib/seo";
import { fetchVenues } from "../lib/venues";

/**
 * Public landing page. Signed-in members go straight to /venues; visitors
 * see what Social Circle is and the venue grid (venues are publicly readable by
 * RLS, so this is the one page search engines can index).
 */
export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const user = await fetchAuthUser();
    if (user) throw redirect({ to: "/feed" });
  },
  loader: async () => {
    try {
      return { venues: await fetchVenues() };
    } catch {
      return { venues: [] };
    }
  },
  head: () => pageHead("", DEFAULT_DESCRIPTION),
  component: LandingPage,
});

const FEATURES = [
  {
    icon: CalendarCheck,
    title: "Book in seconds",
    body: "Pick a venue, a time and how many you are. Live seat counts, instant confirmation code, add-to-calendar.",
  },
  {
    icon: Users,
    title: "See who's going",
    body: "Connect with friends and see which venue they are heading to tonight.",
  },
  {
    icon: MessageCircle,
    title: "Venue chat & messages",
    body: "Talk to other guests who booked the same place, or message a connection directly.",
  },
  {
    icon: ShieldCheck,
    title: "18+ and moderated",
    body: "Every venue has an age range checked at booking time. Reports are reviewed by real people.",
  },
];

function LandingPage() {
  const { venues } = Route.useLoaderData();
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <span className="flex h-9 shrink-0 items-center whitespace-nowrap rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">
          <Logo markClassName="h-4 w-4" />
        </span>
        <nav className="flex items-center gap-2" aria-label="Account">
          <Link to="/login" className={pillClass()}>
            Sign in
          </Link>
          <Link to="/register" className={primaryPillClass()}>
            Join free
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-16 px-4 pb-24 pt-8 sm:px-6">
        <section className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col gap-6">
            <p className="w-fit rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
              Tirana · cafés, lounges and bars
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Reserve a table. Find your people.
            </h1>
            <p className="max-w-xl text-base text-muted-foreground">
              Social Circle lets you book a table at the best spots in Tirana,
              see which friends are going out tonight and chat with the people
              who'll be there.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/register" className={primaryPillClass("px-6 py-3")}>
                Create a free account
              </Link>
              <Link to="/login" className={pillClass("px-6 py-3")}>
                I already have one
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              For ages 18 and over.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li
                key={f.title}
                className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm"
              >
                <f.icon className="h-5 w-5 text-foreground" aria-hidden />
                <h2 className="text-sm font-semibold text-foreground">
                  {f.title}
                </h2>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {f.body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {venues.length > 0 ? (
          <section className="flex flex-col gap-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  Venues
                </h2>
                <p className="text-sm text-muted-foreground">
                  {venues.length} places you can book right now. Sign in to
                  reserve.
                </p>
              </div>
            </div>
            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {venues.map((venue) => (
                <VenueCard key={venue.slug} venue={venue} linkToLogin />
              ))}
            </ul>
          </section>
        ) : null}
      </main>

      <SiteFooter />
    </div>
  );
}
