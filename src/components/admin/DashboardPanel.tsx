import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { fetchAdminAnalytics, type AdminAnalytics } from "../../lib/admin";
import { formatAmount } from "../../lib/donations";
import { Chip } from "../PageChrome";
import { StatChip } from "../StatChip";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "../ui/chart";

const RANGES = [
  { days: 7, weeks: 4, label: "7 days" },
  { days: 30, weeks: 12, label: "30 days" },
  { days: 90, weeks: 26, label: "90 days" },
] as const;

const bookingsConfig = {
  bookings: { label: "Bookings", color: "var(--chart-1)" },
  cancelled: { label: "Cancelled", color: "var(--chart-4)" },
} satisfies ChartConfig;

const venueConfig = {
  bookings: { label: "Bookings", color: "var(--chart-2)" },
} satisfies ChartConfig;

const membersConfig = {
  joined: { label: "Joined", color: "var(--chart-3)" },
} satisfies ChartConfig;

/** "2026-09-16" → "16 Sep", without dragging in a formatter for an axis. */
function shortDay(iso: string): string {
  const [, month = "", day = ""] = iso.split("-");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${Number(day)} ${months[Number(month) - 1] ?? ""}`;
}

/**
 * The Dashboard tab.
 *
 * Loaded on mount rather than in the route loader: four aggregate queries are
 * the most expensive thing in the admin panel, and an admin who opens the page
 * to action a report should not pay for charts they never look at.
 */
export function DashboardPanel() {
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[1]);
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAdminAnalytics({ data: { days: range.days, weeks: range.weeks } })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load analytics.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-4" aria-busy>
        <div className="h-9 w-64 animate-pulse rounded-full bg-muted" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-64 animate-pulse rounded-2xl bg-muted" />
          <div className="h-64 animate-pulse rounded-2xl bg-muted" />
        </div>
      </div>
    );
  }
  if (!data) return null;

  const dailyRows = data.bookingsDaily.map((row) => ({
    ...row,
    label: shortDay(row.day),
  }));
  const periodBookings = data.bookingsDaily.reduce(
    (sum, row) => sum + row.bookings,
    0,
  );
  const periodCancelled = data.bookingsDaily.reduce(
    (sum, row) => sum + row.cancelled,
    0,
  );
  const periodJoined = data.membersWeekly.reduce(
    (sum, row) => sum + row.joined,
    0,
  );
  // Of everything requested in the window, how much was called off. Guarded
  // against the empty period, where 0/0 would render as NaN%.
  const cancelRate =
    periodBookings + periodCancelled > 0
      ? Math.round((periodCancelled / (periodBookings + periodCancelled)) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-6">
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Date range"
      >
        {RANGES.map((option) => (
          <Chip
            key={option.label}
            active={range.label === option.label}
            onClick={() => setRange(option)}
            className="px-4 py-1.5 text-sm"
          >
            {option.label}
          </Chip>
        ))}
        {loading ? (
          <span className="text-xs text-muted-foreground">Updating…</span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-4">
        <StatChip
          label={`Bookings (${range.label})`}
          value={String(periodBookings)}
          accent
        />
        <StatChip label="Cancelled" value={String(periodCancelled)} />
        <StatChip label="Cancel rate" value={`${cancelRate}%`} />
        <StatChip label="New members" value={String(periodJoined)} />
        {data.donationTotals.map((total) => (
          <StatChip
            key={total.currency}
            label={`Donations (${total.currency})`}
            value={formatAmount(total.confirmed_minor, total.currency)}
          />
        ))}
      </div>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground">
          Bookings per day
        </h3>
        <ChartContainer config={bookingsConfig} className="h-64 w-full">
          <AreaChart data={dailyRows} margin={{ left: 4, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={28}
              allowDecimals={false}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              type="monotone"
              dataKey="bookings"
              stroke="var(--color-bookings)"
              fill="var(--color-bookings)"
              fillOpacity={0.2}
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="cancelled"
              stroke="var(--color-cancelled)"
              fill="var(--color-cancelled)"
              fillOpacity={0.15}
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground">
            Bookings by venue
          </h3>
          {data.bookingsByVenue.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No bookings yet.
            </p>
          ) : (
            <ChartContainer config={venueConfig} className="h-64 w-full">
              <BarChart
                data={data.bookingsByVenue}
                layout="vertical"
                margin={{ left: 8, right: 8 }}
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="venue_name"
                  tickLine={false}
                  axisLine={false}
                  width={96}
                  tick={{ fontSize: 11 }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="bookings"
                  fill="var(--color-bookings)"
                  radius={4}
                />
              </BarChart>
            </ChartContainer>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground">
            Members joined per week
          </h3>
          <ChartContainer config={membersConfig} className="h-64 w-full">
            <BarChart
              data={data.membersWeekly.map((row) => ({
                ...row,
                label: shortDay(row.week_start),
              }))}
              margin={{ left: 4, right: 8, top: 8 }}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={16}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={28}
                allowDecimals={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="joined" fill="var(--color-joined)" radius={4} />
            </BarChart>
          </ChartContainer>
        </section>
      </div>

      {data.donationTotals.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground">Donations</h3>
          <ul className="flex flex-col gap-2">
            {data.donationTotals.map((total) => (
              <li
                key={total.currency}
                className="flex flex-wrap items-center justify-between gap-3 text-sm"
              >
                <span className="font-medium text-foreground">
                  {total.currency}
                </span>
                <span className="text-muted-foreground">
                  {/* Never summed across currencies — minor units of ALL and
                      EUR are different things. */}
                  <strong className="font-semibold text-foreground">
                    {formatAmount(total.confirmed_minor, total.currency)}
                  </strong>{" "}
                  confirmed ({total.confirmed_count}) ·{" "}
                  {formatAmount(total.pending_minor, total.currency)} pending (
                  {total.pending_count})
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
