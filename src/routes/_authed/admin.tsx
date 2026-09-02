import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../../components/ui/button";
import {
  fetchAdminOverview,
  fetchReportQueue,
  resolveReport,
} from "../../lib/admin";

export const Route = createFileRoute("/_authed/admin")({
  // Server-side gate. The old prototype showed the dashboard whenever the
  // typed email merely contained the string "admin"; this checks the verified
  // JWT claim, and RLS refuses the rows regardless.
  beforeLoad: ({ context }) => {
    if (!context.user.isAdmin) {
      throw redirect({ to: "/venues" });
    }
  },
  loader: async () => ({
    overview: await fetchAdminOverview(),
    reports: await fetchReportQueue(),
  }),
  component: AdminPage,
});

function AdminPage() {
  const { overview, reports } = Route.useLoaderData();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(id: string, status: "actioned" | "dismissed") {
    setBusyId(id);
    await resolveReport({ data: { id, status } });
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
