import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { Eye, EyeOff, Plus } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

import { Avatar } from "../../components/Avatar";
import { ConfirmButton } from "../../components/ConfirmButton";
import { AuditPanel } from "../../components/admin/AuditPanel";
import { BookingsPanel } from "../../components/admin/BookingsPanel";
import { DashboardPanel } from "../../components/admin/DashboardPanel";
import { ModerationPanel } from "../../components/admin/ModerationPanel";
import { VenuesPanel } from "../../components/admin/VenuesPanel";
import type { Runner } from "../../components/admin/AdminShared";
import { EmptyCard } from "../../components/admin/EmptyCard";
import { ExportButton } from "../../components/admin/ExportButton";
import { MembersPanel } from "../../components/admin/MembersPanel";
import { ReviewsPanel } from "../../components/admin/ReviewsPanel";
import { VerificationPanel } from "../../components/admin/VerificationPanel";
import {
  PageHeader,
  RouteError,
  SearchInput,
  pillClass,
  primaryPillClass,
} from "../../components/PageChrome";
import { PillTabs, tabPanelProps } from "../../components/PillTabs";
import { StatChip } from "../../components/StatChip";
import { StatChipSkeleton } from "../../components/Skeletons";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  deleteLocation,
  exportBookingsCsv,
  exportDonationsCsv,
  exportReportsCsv,
  fetchAdminBookings,
  fetchAdminLocations,
  fetchAdminOverview,
  fetchAdminVenues,
  fetchAuditLog,
  fetchMembers,
  fetchModerationFeed,
  fetchPendingDonations,
  fetchReportQueue,
  resolveReport,
  setBookingStatus,
  setContentHidden,
  setDonationStatus,
  setUserSuspended,
  setVenueActive,
  upsertLocation,
  upsertVenue,
  type AdminBooking,
  type AdminLocation,
  type AdminVenue,
  type AuditEntry,
  type ModerationItem,
} from "../../lib/admin";
import { formatAmount } from "../../lib/donations";
import { pageHead } from "../../lib/seo";
import {
  formatBookingDate,
  formatDate,
  formatDateTime,
  formatSlot,
} from "../../lib/utils";
import { VENUE_CATEGORIES } from "../../lib/venue-filters";

type Tab =
  | "dashboard"
  | "reports"
  | "donations"
  | "bookings"
  | "venues"
  | "reviews"
  | "verification"
  | "moderation"
  | "members"
  | "audit";

export const Route = createFileRoute("/_authed/admin")({
  beforeLoad: ({ context }) => {
    if (!context.user.isAdmin) throw redirect({ to: "/venues" });
  },
  loader: async () => {
    const [overview, reports, donations, venues, members, bookings] =
      await Promise.all([
        fetchAdminOverview(),
        fetchReportQueue(),
        fetchPendingDonations(),
        fetchAdminVenues(),
        fetchMembers({ data: { page: 0 } }),
        fetchAdminBookings({ data: { page: 0 } }),
      ]);
    return { overview, reports, donations, venues, members, bookings };
  },
  head: () => pageHead("Admin", undefined, { noindex: true }),
  pendingComponent: () => (
    <div className="flex flex-col gap-8" aria-busy>
      <div className="h-8 w-32 animate-pulse rounded-lg bg-muted" />
      <StatChipSkeleton count={4} />
      <div className="h-10 w-full max-w-xl animate-pulse rounded-full bg-muted" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
      ))}
    </div>
  ),
  errorComponent: () => <RouteError title="Could not load the admin panel" />,
  component: AdminPage,
});

const STATUS_STYLES: Record<AdminBooking["status"], string> = {
  confirmed: "bg-accent text-accent-foreground",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

function AdminPage() {
  const { overview, reports, donations, venues, members, bookings } =
    Route.useLoaderData();
  const router = useRouter();
  const tabsId = useId();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function run(
    id: string,
    fn: () => Promise<{ ok: boolean; error?: string }>,
    okMsg?: string,
  ) {
    setBusyId(id);
    try {
      const result = await fn();
      if (!result.ok) toast.error(result.error ?? "Something went wrong.");
      else if (okMsg) toast.success(okMsg);
      await router.invalidate();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusyId(null);
    }
  }

  const suspend = (userId: string, suspended: boolean) =>
    run(
      userId,
      () => setUserSuspended({ data: { userId, suspended } }),
      suspended ? "Member suspended" : "Member reinstated",
    );

  const tabs = [
    { id: "dashboard" as const, label: "Dashboard" },
    { id: "reports" as const, label: "Reports", badge: reports.length },
    { id: "donations" as const, label: "Donations", badge: donations.length },
    { id: "bookings" as const, label: "Bookings" },
    { id: "venues" as const, label: "Venues" },
    { id: "reviews" as const, label: "Reviews" },
    { id: "verification" as const, label: "Verification" },
    { id: "moderation" as const, label: "Moderation" },
    { id: "members" as const, label: "Members" },
    { id: "audit" as const, label: "Audit log" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Admin"
        subtitle="Live counts from the database. Every action is written to the audit log."
      />

      <div className="flex flex-wrap gap-4">
        <StatChip label="Members" value={String(overview.members)} />
        <StatChip
          label="Confirmed bookings"
          value={String(overview.confirmedBookings)}
          accent
        />
        <StatChip label="Open reports" value={String(overview.openReports)} />
        <StatChip label="Venues" value={String(overview.venues)} />
      </div>

      <PillTabs
        tabs={tabs}
        value={activeTab}
        onChange={setActiveTab}
        label="Admin sections"
      />

      {activeTab === "dashboard" ? (
        <section {...tabPanelProps(tabsId, "dashboard")}>
          <DashboardPanel />
        </section>
      ) : null}

      {activeTab === "reports" ? (
        <section
          {...tabPanelProps(tabsId, "reports")}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {reports.length} open
            </span>
            <ExportButton
              label="Export all reports"
              filename="reports"
              fetchCsv={exportReportsCsv}
            />
          </div>
          {reports.length === 0 ? (
            <EmptyCard text="No open reports. Filed reports appear here." />
          ) : (
            <ul className="flex flex-col gap-3">
              {reports.map((report) => {
                const reportedUserId = report.reported_user_id;
                return (
                  <li
                    key={report.id}
                    className="flex flex-wrap items-start gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="text-sm font-semibold capitalize text-foreground">
                        {report.reason.replace(/_/g, " ")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {report.reportedUserLabel
                          ? `Member: ${report.reportedUserLabel}`
                          : null}
                        {report.reportedUserLabel && report.venueName
                          ? " · "
                          : ""}
                        {report.venueName ? `Venue: ${report.venueName}` : null}
                      </p>
                      {report.description ? (
                        <p className="text-sm text-muted-foreground">
                          {report.description}
                        </p>
                      ) : null}
                      {/* The reported item itself, so the report can be judged
                          without hunting for it. Private messages carry no
                          body on purpose — see fetchReportQueue. */}
                      {report.target_kind ? (
                        report.targetMissing ? (
                          <p className="rounded-xl border border-dashed border-border px-3 py-2 text-xs italic text-muted-foreground">
                            The reported {report.target_kind.replace("_", " ")}{" "}
                            has since been deleted.
                          </p>
                        ) : report.targetBody !== null ? (
                          <blockquote className="rounded-xl border-l-2 border-destructive/40 bg-muted/50 px-3 py-2 text-sm text-foreground">
                            <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Reported {report.target_kind.replace("_", " ")}
                            </span>
                            {report.targetBody || (
                              <em className="text-muted-foreground">
                                No text — rating only.
                              </em>
                            )}
                          </blockquote>
                        ) : (
                          <p className="text-xs italic text-muted-foreground">
                            Reported a {report.target_kind.replace("_", " ")}.
                          </p>
                        )
                      ) : null}
                      <p className="text-xs tabular-nums text-muted-foreground">
                        Filed {formatDate(report.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {reportedUserId ? (
                        <ConfirmButton
                          title="Suspend this member?"
                          description="They will be signed out of booking, hidden from search and unable to post. You can reinstate them from the Members tab."
                          confirmLabel="Suspend"
                          onConfirm={() => suspend(reportedUserId, true)}
                          disabled={busyId === reportedUserId}
                          className={pillClass("text-xs", { danger: true })}
                        >
                          Suspend member
                        </ConfirmButton>
                      ) : null}
                      <button
                        type="button"
                        disabled={busyId === report.id}
                        onClick={() =>
                          run(
                            report.id,
                            () =>
                              resolveReport({
                                data: { id: report.id, status: "dismissed" },
                              }),
                            "Report dismissed",
                          )
                        }
                        className={pillClass("text-xs")}
                      >
                        Dismiss
                      </button>
                      <button
                        type="button"
                        disabled={busyId === report.id}
                        onClick={() =>
                          run(
                            report.id,
                            () =>
                              resolveReport({
                                data: { id: report.id, status: "actioned" },
                              }),
                            "Report marked as actioned",
                          )
                        }
                        className={primaryPillClass("text-xs")}
                      >
                        Take action
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {activeTab === "donations" ? (
        <section
          {...tabPanelProps(tabsId, "donations")}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {donations.length} awaiting confirmation. Buy Me a Coffee
              donations confirm themselves and do not appear here.
            </span>
            <ExportButton
              label="Export all donations"
              filename="donations"
              fetchCsv={exportDonationsCsv}
            />
          </div>
          {donations.length === 0 ? (
            <EmptyCard text="Nothing awaiting confirmation." />
          ) : (
            <ul className="flex flex-col gap-3">
              {donations.map((donation) => (
                <li
                  key={donation.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {formatAmount(donation.amount_minor, donation.currency)}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {donation.method.replace("_", " ")}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {donation.donor_email ?? "no email"} ·{" "}
                      {formatDate(donation.created_at)}
                      {donation.message ? ` · ${donation.message}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={busyId === donation.id}
                      onClick={() =>
                        run(
                          donation.id,
                          () =>
                            setDonationStatus({
                              data: { id: donation.id, status: "confirmed" },
                            }),
                          "Donation confirmed",
                        )
                      }
                      className={primaryPillClass("text-xs")}
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      disabled={busyId === donation.id}
                      onClick={() =>
                        run(
                          donation.id,
                          () =>
                            setDonationStatus({
                              data: { id: donation.id, status: "failed" },
                            }),
                          "Marked as failed",
                        )
                      }
                      className={pillClass("text-xs", { danger: true })}
                    >
                      Mark failed
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {activeTab === "bookings" ? (
        <section {...tabPanelProps(tabsId, "bookings")}>
          <BookingsPanel initialBookings={bookings} busyId={busyId} run={run} />
        </section>
      ) : null}

      {activeTab === "venues" ? (
        <section {...tabPanelProps(tabsId, "venues")}>
          <VenuesPanel venues={venues} busyId={busyId} run={run} />
        </section>
      ) : null}

      {activeTab === "reviews" ? (
        <section {...tabPanelProps(tabsId, "reviews")}>
          <ReviewsPanel venues={venues} />
        </section>
      ) : null}

      {activeTab === "verification" ? (
        <section {...tabPanelProps(tabsId, "verification")}>
          <VerificationPanel />
        </section>
      ) : null}

      {activeTab === "moderation" ? (
        <section {...tabPanelProps(tabsId, "moderation")}>
          <ModerationPanel venues={venues} />
        </section>
      ) : null}

      {activeTab === "members" ? (
        <section {...tabPanelProps(tabsId, "members")}>
          <MembersPanel
            initial={members}
            busyId={busyId}
            suspend={suspend}
            onChanged={() => router.invalidate()}
          />
        </section>
      ) : null}

      {activeTab === "audit" ? (
        <section {...tabPanelProps(tabsId, "audit")}>
          <AuditPanel />
        </section>
      ) : null}
    </div>
  );
}
