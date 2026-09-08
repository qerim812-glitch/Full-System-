import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "../../components/ui/button";
import {
  fetchAdminOverview,
  fetchPendingDonations,
  fetchReportQueue,
  resolveReport,
  setDonationStatus,
} from "../../lib/admin";
import { formatAmount } from "../../lib/donations";

export const Route = createFileRoute("/_authed/admin")({
  // Server-side gate. The old prototype showed the dashboard whenever the
  // typed email merely contained the string "admin"; this checks the verified
  // JWT claim, and RLS refuses the rows regardless.
  beforeLoad: ({ context }) => {
    if (!context.user.isAdmin) {
      throw redirect({ to: "/venues" });
    }
  },
  loader: async () => {
    const [overview, reports, donations] = await Promise.all([
      fetchAdminOverview(),
      fetchReportQueue(),
      fetchPendingDonations(),
    ]);
    return { overview, reports, donations };
  },
  component: AdminPage,
});

function AdminPage() {
  const { overview, reports, donations } = Route.useLoaderData();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(id: string, status: "actioned" | "dismissed") {
    setBusyId(id);
    await resolveReport({ data: { id, status } });
    await router.invalidate();
    setBusyId(null);
  }

  async function decide(id: string, status: "confirmed" | "failed") {
    setBusyId(id);
    const result = await setDonationStatus({ data: { id, status } });
    if (!result.ok) toast.error(result.error);
    await router.invalidate();
    setBusyId(null);
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Admin
        </h1>
        <p className="text-sm text-muted-foreground">
          Live counts from the database. Every action here is written to the
          audit log.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-0 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-4">
        <Stat label="Members" value={overview.members} />
        <Stat label="Confirmed bookings" value={overview.confirmedBookings} />
        <Stat label="Open reports" value={overview.openReports} />
        <Stat label="Venues" value={overview.venues} />
      </dl>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-foreground">
          Report queue
        </h2>

        {reports.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
            Nothing waiting. Reports filed by users appear here.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {reports.map((report) => (
              <li
                key={report.id}
                className="flex flex-wrap items-start gap-4 rounded-lg border border-border bg-card p-4"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-sm font-semibold capitalize text-foreground">
                    {report.reason.replace(/_/g, " ")}
                  </p>
                  {report.description ? (
                    <p className="text-sm text-muted-foreground">
                      {report.description}
                    </p>
                  ) : null}
                  <p className="text-xs tabular-nums text-muted-foreground">
                    Filed {report.created_at.slice(0, 10)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === report.id}
                    onClick={() => act(report.id, "dismissed")}
                  >
                    Dismiss
                  </Button>
                  <Button
                    size="sm"
                    disabled={busyId === report.id}
                    onClick={() => act(report.id, "actioned")}
                  >
                    Take action
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-foreground">
            Pending donations
          </h2>
          <span className="text-xs text-muted-foreground">
            A donation stays pending until someone confirms the money arrived
          </span>
        </div>

        {donations.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground">
            Nothing awaiting confirmation.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {donations.map((donation) => (
              <li
                key={donation.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium tabular-nums text-foreground">
                    {formatAmount(donation.amount_minor, donation.currency)}
                    <span className="ml-2 font-normal text-muted-foreground">
                      {donation.method.replace("_", " ")}
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {donation.donor_email ?? "no email"} ·{" "}
                    {new Date(donation.created_at).toLocaleDateString()}
                    {donation.message ? ` · ${donation.message}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    disabled={busyId === donation.id}
                    onClick={() => void decide(donation.id, "confirmed")}
                  >
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === donation.id}
                    onClick={() => void decide(donation.id, "failed")}
                  >
                    Mark failed
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-b border-r border-border p-4 last:border-r-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}
