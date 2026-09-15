import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { Download, Eye, EyeOff, Plus } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

import { Avatar } from "../../components/Avatar";
import { ConfirmButton } from "../../components/ConfirmButton";
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
  type AdminMember,
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
  | "reports"
  | "donations"
  | "bookings"
  | "venues"
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
  const [activeTab, setActiveTab] = useState<Tab>("reports");
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
    { id: "reports" as const, label: "Reports", badge: reports.length },
    { id: "donations" as const, label: "Donations", badge: donations.length },
    { id: "bookings" as const, label: "Bookings" },
    { id: "venues" as const, label: "Venues" },
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

      {activeTab === "reports" ? (
        <section
          {...tabPanelProps(tabsId, "reports")}
          className="flex flex-col gap-3"
        >
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

      {activeTab === "moderation" ? (
        <section {...tabPanelProps(tabsId, "moderation")}>
          <ModerationPanel venues={venues} />
        </section>
      ) : null}

      {activeTab === "members" ? (
        <section {...tabPanelProps(tabsId, "members")}>
          <MembersPanel
            initialMembers={members}
            busyId={busyId}
            suspend={suspend}
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

type Runner = (
  id: string,
  fn: () => Promise<{ ok: boolean; error?: string }>,
  okMsg?: string,
) => Promise<void>;

/* ══════════════════════════════════════════════════════════════════════════
   Bookings — list, status management, CSV export
   ══════════════════════════════════════════════════════════════════════════ */
function BookingsPanel({
  initialBookings,
  busyId,
  run,
}: {
  initialBookings: AdminBooking[];
  busyId: string | null;
  run: Runner;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [bookings, setBookings] = useState(initialBookings);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const PAGE_SIZE = 50;

  useEffect(() => {
    setBookings(initialBookings);
    setPage(0);
  }, [initialBookings]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await fetchAdminBookings({ data: { page: page + 1 } });
      setPage((p) => p + 1);
      setBookings((prev) => [...prev, ...next]);
    } catch {
      toast.error("Could not load more bookings.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const csv = await exportBookingsCsv();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `newpop-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not export bookings.");
    } finally {
      setExporting(false);
    }
  }

  const term = search.trim().toLowerCase();
  const visible = term
    ? bookings.filter(
        (b) =>
          b.venue_name?.toLowerCase().includes(term) ||
          b.user_name?.toLowerCase().includes(term) ||
          b.user_email?.toLowerCase().includes(term),
      )
    : bookings;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Filter by venue, name or email…"
          label="Filter bookings"
          className="sm:w-72"
        />
        <span className="text-xs text-muted-foreground">
          {visible.length} bookings
        </span>
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={exporting}
          className={pillClass("ml-auto gap-1.5 text-xs")}
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {visible.length === 0 ? (
        <EmptyCard text="No bookings found." />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((b) => (
            <li
              key={b.id}
              className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-sm font-semibold text-foreground">
                  {b.venue_name ?? b.venue_slug}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatBookingDate(b.booking_date)} at{" "}
                  {formatSlot(b.booking_time)} · {b.party_size}{" "}
                  {b.party_size === 1 ? "person" : "people"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {b.user_name ?? "(no name)"} · {b.user_email ?? "no email"}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLES[b.status]}`}
              >
                {b.status}
              </span>
              <div className="flex gap-2">
                {b.status !== "completed" ? (
                  <button
                    type="button"
                    disabled={busyId === b.id}
                    onClick={() =>
                      run(
                        b.id,
                        () =>
                          setBookingStatus({
                            data: { id: b.id, status: "completed" },
                          }),
                        "Booking marked completed",
                      )
                    }
                    className={primaryPillClass("text-xs")}
                  >
                    Complete
                  </button>
                ) : null}
                {b.status === "confirmed" ? (
                  <ConfirmButton
                    title="Cancel this booking?"
                    description={`${b.user_name ?? b.user_email ?? "The member"} will be notified that their table at ${b.venue_name ?? b.venue_slug} was cancelled.`}
                    confirmLabel="Cancel booking"
                    cancelLabel="Keep"
                    onConfirm={() =>
                      run(
                        b.id,
                        () =>
                          setBookingStatus({
                            data: { id: b.id, status: "cancelled" },
                          }),
                        "Booking cancelled",
                      )
                    }
                    disabled={busyId === b.id}
                    className={pillClass("text-xs", { danger: true })}
                  >
                    Cancel
                  </ConfirmButton>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {bookings.length === (page + 1) * PAGE_SIZE ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className={pillClass()}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Venues — list, add/edit form, branches
   ══════════════════════════════════════════════════════════════════════════ */
function VenuesPanel({
  venues,
  busyId,
  run,
}: {
  venues: AdminVenue[];
  busyId: string | null;
  run: Runner;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminVenue | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [branchesFor, setBranchesFor] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">
          {venues.length} venue{venues.length !== 1 ? "s" : ""}
        </h2>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className={primaryPillClass("gap-1.5")}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add venue
        </button>
      </div>

      {showForm ? (
        <VenueForm
          initial={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            void router.invalidate();
          }}
        />
      ) : null}

      {venues.length === 0 ? (
        <EmptyCard text="No venues yet. Add one above." />
      ) : (
        <ul className="flex flex-col gap-3">
          {venues.map((venue) => (
            <li
              key={venue.slug}
              className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      {venue.name}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        venue.is_active
                          ? "bg-accent text-accent-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {venue.is_active ? "Active" : "Inactive"}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
                      {venue.category}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {venue.slug} · Ages {venue.min_age}–{venue.max_age} ·{" "}
                    {venue.capacity} seats · {venue.opens_at}–{venue.closes_at}{" "}
                    every {venue.slot_minutes} min
                    {venue.address ? ` · ${venue.address}` : ""}
                  </p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {venue.description}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setBranchesFor(
                        branchesFor === venue.slug ? null : venue.slug,
                      )
                    }
                    className={pillClass("text-xs")}
                    aria-expanded={branchesFor === venue.slug}
                  >
                    Branches
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(venue);
                      setShowForm(true);
                    }}
                    className={pillClass("text-xs")}
                  >
                    Edit
                  </button>
                  {venue.is_active ? (
                    <ConfirmButton
                      title={`Deactivate ${venue.name}?`}
                      description="It disappears from the venue list and stops accepting bookings. Existing bookings are kept."
                      confirmLabel="Deactivate"
                      onConfirm={() =>
                        run(
                          venue.slug,
                          () =>
                            setVenueActive({
                              data: { slug: venue.slug, is_active: false },
                            }),
                          "Venue deactivated",
                        )
                      }
                      disabled={busyId === venue.slug}
                      className={pillClass("text-xs", { danger: true })}
                    >
                      Deactivate
                    </ConfirmButton>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === venue.slug}
                      onClick={() =>
                        run(
                          venue.slug,
                          () =>
                            setVenueActive({
                              data: { slug: venue.slug, is_active: true },
                            }),
                          "Venue activated",
                        )
                      }
                      className={primaryPillClass("text-xs")}
                    >
                      Activate
                    </button>
                  )}
                </div>
              </div>
              {branchesFor === venue.slug ? (
                <LocationsPanel venueSlug={venue.slug} />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VenueForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: AdminVenue | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = initial !== null;

  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? "");
  const [locationUrl, setLocationUrl] = useState(initial?.location_url ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [category, setCategory] = useState(initial?.category ?? "cafe");
  const [priceBand, setPriceBand] = useState(String(initial?.price_band ?? 2));
  const [opensAt, setOpensAt] = useState(initial?.opens_at ?? "18:00");
  const [closesAt, setClosesAt] = useState(initial?.closes_at ?? "23:00");
  const [slotMinutes, setSlotMinutes] = useState(
    String(initial?.slot_minutes ?? 60),
  );
  const [minAge, setMinAge] = useState(String(initial?.min_age ?? 18));
  const [maxAge, setMaxAge] = useState(String(initial?.max_age ?? 35));
  const [capacity, setCapacity] = useState(String(initial?.capacity ?? 50));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await upsertVenue({
        data: {
          slug,
          name,
          description,
          image_url: imageUrl || null,
          location_url: locationUrl || null,
          address: address.trim() || null,
          phone: phone.trim() || null,
          category: category as "cafe",
          price_band: Number(priceBand),
          opens_at: opensAt,
          closes_at: closesAt,
          slot_minutes: Number(slotMinutes) as 60,
          min_age: Number(minAge),
          max_age: Number(maxAge),
          capacity: Number(capacity),
        },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(isEdit ? "Venue updated" : "Venue created");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed.");
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">
          {isEdit ? `Edit ${initial.name}` : "Add new venue"}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <Field label="Slug (URL key)" id="slug">
          <Input
            id="slug"
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={isEdit}
            placeholder="mulliri"
            className="rounded-xl"
          />
        </Field>
        <Field label="Name" id="name">
          <Input
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mulliri Vjeter"
            className="rounded-xl"
          />
        </Field>
        <Field label="Category" id="category">
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputClass}
          >
            {VENUE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2 lg:col-span-3">
          <Field label="Description" id="desc">
            <Textarea
              id="desc"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short description of the venue"
              className="rounded-xl"
            />
          </Field>
        </div>
        <Field label="Address (optional)" id="address">
          <Input
            id="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Rruga Ibrahim Rugova 12, Tirana"
            className="rounded-xl"
          />
        </Field>
        <Field label="Phone (optional)" id="phone">
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+355 …"
            className="rounded-xl"
          />
        </Field>
        <Field label="Price band" id="priceBand">
          <select
            id="priceBand"
            value={priceBand}
            onChange={(e) => setPriceBand(e.target.value)}
            className={inputClass}
          >
            <option value="1">€ — budget</option>
            <option value="2">€€ — mid</option>
            <option value="3">€€€ — upscale</option>
            <option value="4">€€€€ — premium</option>
          </select>
        </Field>
        <Field label="Image URL (optional)" id="imageUrl">
          <Input
            id="imageUrl"
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
            className="rounded-xl"
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Google Maps URL (optional)" id="locationUrl">
            <Input
              id="locationUrl"
              type="url"
              value={locationUrl}
              onChange={(e) => setLocationUrl(e.target.value)}
              placeholder="https://maps.google.com/…"
              className="rounded-xl"
            />
          </Field>
        </div>
        <Field label="Opens at" id="opensAt">
          <Input
            id="opensAt"
            type="time"
            required
            step={1800}
            value={opensAt}
            onChange={(e) => setOpensAt(e.target.value)}
            className="rounded-xl"
          />
        </Field>
        <Field label="Closes at" id="closesAt">
          <Input
            id="closesAt"
            type="time"
            required
            step={1800}
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
            className="rounded-xl"
          />
        </Field>
        <Field label="Slot length" id="slotMinutes">
          <select
            id="slotMinutes"
            value={slotMinutes}
            onChange={(e) => setSlotMinutes(e.target.value)}
            className={inputClass}
          >
            <option value="30">30 minutes</option>
            <option value="60">1 hour</option>
            <option value="90">1.5 hours</option>
            <option value="120">2 hours</option>
          </select>
        </Field>
        <Field label="Min age" id="minAge">
          <Input
            id="minAge"
            type="number"
            required
            min={18}
            max={99}
            value={minAge}
            onChange={(e) => setMinAge(e.target.value)}
            className="rounded-xl"
          />
        </Field>
        <Field label="Max age" id="maxAge">
          <Input
            id="maxAge"
            type="number"
            required
            min={18}
            max={99}
            value={maxAge}
            onChange={(e) => setMaxAge(e.target.value)}
            className="rounded-xl"
          />
        </Field>
        <Field label="Capacity (seats per slot)" id="capacity">
          <Input
            id="capacity"
            type="number"
            required
            min={1}
            max={10000}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            className="rounded-xl"
          />
        </Field>

        <div className="flex gap-3 sm:col-span-2 lg:col-span-3">
          <button type="submit" disabled={busy} className={primaryPillClass()}>
            {busy ? "Saving…" : isEdit ? "Save changes" : "Create venue"}
          </button>
          <button type="button" onClick={onClose} className={pillClass()}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Branches (venue_locations) ─────────────────────────────────────────── */
function LocationsPanel({ venueSlug }: { venueSlug: string }) {
  const [locations, setLocations] = useState<AdminLocation[] | null>(null);
  const [editing, setEditing] = useState<AdminLocation | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      setLocations(await fetchAdminLocations({ data: { venueSlug } }));
    } catch {
      toast.error("Could not load branches.");
      setLocations([]);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchAdminLocations({ data: { venueSlug } })
      .then((rows) => {
        if (!cancelled) setLocations(rows);
      })
      .catch(() => {
        if (!cancelled) setLocations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [venueSlug]);

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      const result = await deleteLocation({ data: { id } });
      if (!result.ok) toast.error(result.error);
      else
        toast.success(
          result.deactivated
            ? "Branch deactivated (it has bookings)"
            : "Branch deleted",
        );
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggle(loc: AdminLocation) {
    setBusyId(loc.id);
    try {
      const result = await upsertLocation({
        data: {
          id: loc.id,
          venueSlug,
          name: loc.name,
          address: loc.address,
          capacity: loc.capacity,
          is_active: !loc.is_active,
        },
      });
      if (!result.ok) toast.error(result.error);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Branches {locations ? `(${locations.length})` : ""}
        </h4>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setAdding(true);
          }}
          className={pillClass("gap-1 text-xs")}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add branch
        </button>
      </div>

      {adding || editing ? (
        <LocationForm
          venueSlug={venueSlug}
          initial={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={() => {
            setAdding(false);
            setEditing(null);
            void load();
          }}
        />
      ) : null}

      {locations === null ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : locations.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No branches. Bookings use the venue-wide capacity.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {locations.map((loc) => (
            <li
              key={loc.id}
              className="flex flex-wrap items-center gap-3 rounded-xl bg-card px-4 py-2.5 text-sm shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">
                  {loc.name}
                  {!loc.is_active ? (
                    <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      Inactive
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {loc.address ?? "No address"} ·{" "}
                  {loc.capacity ? `${loc.capacity} seats` : "venue capacity"}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setEditing(loc);
                  }}
                  className={pillClass("text-xs")}
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busyId === loc.id}
                  onClick={() => void handleToggle(loc)}
                  className={pillClass("text-xs")}
                >
                  {loc.is_active ? "Deactivate" : "Activate"}
                </button>
                <ConfirmButton
                  title={`Delete ${loc.name}?`}
                  description="If any booking references this branch it is deactivated instead of deleted, so history keeps resolving."
                  confirmLabel="Delete"
                  onConfirm={() => handleDelete(loc.id)}
                  disabled={busyId === loc.id}
                  className={pillClass("text-xs", { danger: true })}
                >
                  Delete
                </ConfirmButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LocationForm({
  venueSlug,
  initial,
  onClose,
  onSaved,
}: {
  venueSlug: string;
  initial: AdminLocation | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [capacity, setCapacity] = useState(
    initial?.capacity ? String(initial.capacity) : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await upsertLocation({
        data: {
          ...(initial ? { id: initial.id } : {}),
          venueSlug,
          name: name.trim(),
          address: address.trim() || null,
          capacity: capacity ? Number(capacity) : null,
          is_active: initial?.is_active ?? true,
        },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(initial ? "Branch updated" : "Branch added");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-3 grid gap-3 rounded-xl bg-card p-4 shadow-sm sm:grid-cols-[1fr_1fr_8rem]"
    >
      {error ? (
        <p className="text-xs text-destructive sm:col-span-3" role="alert">
          {error}
        </p>
      ) : null}
      <Field label="Branch name" id={`loc-name-${initial?.id ?? "new"}`}>
        <Input
          id={`loc-name-${initial?.id ?? "new"}`}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Blloku"
          className="rounded-xl"
        />
      </Field>
      <Field label="Address (optional)" id={`loc-addr-${initial?.id ?? "new"}`}>
        <Input
          id={`loc-addr-${initial?.id ?? "new"}`}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Street, number"
          className="rounded-xl"
        />
      </Field>
      <Field
        label="Seats (blank = venue)"
        id={`loc-cap-${initial?.id ?? "new"}`}
      >
        <Input
          id={`loc-cap-${initial?.id ?? "new"}`}
          type="number"
          min={1}
          max={10000}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          className="rounded-xl"
        />
      </Field>
      <div className="flex gap-2 sm:col-span-3">
        <button
          type="submit"
          disabled={busy}
          className={primaryPillClass("text-xs")}
        >
          {busy ? "Saving…" : initial ? "Save branch" : "Add branch"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className={pillClass("text-xs")}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Moderation — reviews + venue chat, hide / restore
   ══════════════════════════════════════════════════════════════════════════ */
function ModerationPanel({ venues }: { venues: AdminVenue[] }) {
  const [venueSlug, setVenueSlug] = useState<string>("");
  const [items, setItems] = useState<ModerationItem[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showHiddenOnly, setShowHiddenOnly] = useState(false);

  async function load(slug: string) {
    try {
      setItems(
        await fetchModerationFeed({ data: slug ? { venueSlug: slug } : {} }),
      );
    } catch {
      toast.error("Could not load content.");
      setItems([]);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    fetchModerationFeed({ data: venueSlug ? { venueSlug } : {} })
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [venueSlug]);

  async function toggle(item: ModerationItem) {
    setBusyId(item.id);
    try {
      const result = await setContentHidden({
        data: { kind: item.kind, id: item.id, hidden: !item.is_hidden },
      });
      if (!result.ok) toast.error(result.error);
      else toast.success(item.is_hidden ? "Restored" : "Hidden from members");
      await load(venueSlug);
    } finally {
      setBusyId(null);
    }
  }

  const visible = (items ?? []).filter((i) => !showHiddenOnly || i.is_hidden);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Venue
          <select
            value={venueSlug}
            onChange={(e) => setVenueSlug(e.target.value)}
            className="h-10 rounded-full border border-border bg-card px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All venues</option>
            {venues.map((v) => (
              <option key={v.slug} value={v.slug}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showHiddenOnly}
            onChange={(e) => setShowHiddenOnly(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Hidden only
        </label>
        <span className="text-xs text-muted-foreground">
          {items ? `${visible.length} items` : "Loading…"}
        </span>
      </div>

      {items === null ? (
        <div className="flex flex-col gap-2" aria-busy>
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyCard text="Nothing to moderate here." />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((item) => (
            <li
              key={`${item.kind}-${item.id}`}
              className={`flex flex-wrap items-start gap-4 rounded-2xl border bg-card px-5 py-4 shadow-sm ${
                item.is_hidden ? "border-destructive/30" : "border-border"
              }`}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-muted px-2 py-0.5 font-semibold capitalize">
                    {item.kind === "review"
                      ? `Review · ${item.rating}/5`
                      : "Chat"}
                  </span>
                  <span>{item.venue_name ?? item.venue_slug}</span>
                  <span>·</span>
                  <span>
                    {item.author_name ?? item.author_email ?? "unknown"}
                  </span>
                  <span>·</span>
                  <time dateTime={item.created_at}>
                    {formatDateTime(item.created_at)}
                  </time>
                  {item.is_hidden ? (
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-semibold text-destructive">
                      Hidden
                    </span>
                  ) : null}
                </div>
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {item.body ?? (
                    <span className="italic text-muted-foreground">
                      (no text)
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                disabled={busyId === item.id}
                onClick={() => void toggle(item)}
                className={pillClass("gap-1.5 text-xs", {
                  danger: !item.is_hidden,
                })}
              >
                {item.is_hidden ? (
                  <>
                    <Eye className="h-3.5 w-3.5" aria-hidden /> Restore
                  </>
                ) : (
                  <>
                    <EyeOff className="h-3.5 w-3.5" aria-hidden /> Hide
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Members
   ══════════════════════════════════════════════════════════════════════════ */
function MembersPanel({
  initialMembers,
  busyId,
  suspend,
}: {
  initialMembers: AdminMember[];
  busyId: string | null;
  suspend: (userId: string, suspended: boolean) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [members, setMembers] = useState(initialMembers);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 50;

  useEffect(() => {
    setMembers(initialMembers);
    setPage(0);
  }, [initialMembers]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await fetchMembers({ data: { page: page + 1 } });
      setPage((p) => p + 1);
      setMembers((prev) => [...prev, ...next]);
    } catch {
      toast.error("Could not load more members.");
    } finally {
      setLoadingMore(false);
    }
  }

  const term = search.trim().toLowerCase();
  const visible = term
    ? members.filter(
        (m) =>
          m.display_name?.toLowerCase().includes(term) ||
          m.email?.toLowerCase().includes(term),
      )
    : members;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Filter by name or email…"
          label="Filter members"
        />
        <span className="text-xs text-muted-foreground">
          {visible.length} members
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyCard text="No members found." />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((member) => (
            <li
              key={member.id}
              className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar
                  name={member.display_name ?? member.email}
                  size="sm"
                  tone="muted"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {member.display_name ?? "(no name)"}
                    {member.is_suspended ? (
                      <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                        Suspended
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.email} · Joined {formatDate(member.created_at)}
                  </p>
                </div>
              </div>
              {member.is_suspended ? (
                <button
                  type="button"
                  disabled={busyId === member.id}
                  onClick={() => void suspend(member.id, false)}
                  className={primaryPillClass("text-xs")}
                >
                  Reinstate
                </button>
              ) : (
                <ConfirmButton
                  title={`Suspend ${member.display_name ?? member.email ?? "this member"}?`}
                  description="They can no longer book, post or appear in search until reinstated."
                  confirmLabel="Suspend"
                  onConfirm={() => suspend(member.id, true)}
                  disabled={busyId === member.id}
                  className={pillClass("text-xs", { danger: true })}
                >
                  Suspend
                </ConfirmButton>
              )}
            </li>
          ))}
        </ul>
      )}

      {members.length === (page + 1) * PAGE_SIZE ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className={pillClass()}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Audit log
   ══════════════════════════════════════════════════════════════════════════ */
const ACTION_COLOURS: Record<string, string> = {
  "report.actioned": "bg-destructive/10 text-destructive",
  "report.dismissed": "bg-muted text-muted-foreground",
  "donation.confirmed": "bg-accent text-accent-foreground",
  "donation.failed": "bg-destructive/10 text-destructive",
  "user.suspend": "bg-destructive/10 text-destructive",
  "user.unsuspend": "bg-accent text-accent-foreground",
  "venue.activate": "bg-accent text-accent-foreground",
  "venue.deactivate": "bg-muted text-muted-foreground",
  "booking.cancelled": "bg-destructive/10 text-destructive",
  "booking.completed": "bg-accent text-accent-foreground",
  "review.hide": "bg-destructive/10 text-destructive",
  "chat.hide": "bg-destructive/10 text-destructive",
};

function AuditPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 50;

  useEffect(() => {
    let cancelled = false;
    fetchAuditLog({ data: { page: 0 } })
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load audit log.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await fetchAuditLog({ data: { page: page + 1 } });
      setPage((p) => p + 1);
      setEntries((prev) => [...prev, ...next]);
    } catch {
      toast.error("Could not load more entries.");
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2" aria-busy>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Append-only log of every admin action. Records cannot be edited or
        deleted.
      </p>

      {entries.length === 0 ? (
        <EmptyCard text="No audit entries yet." />
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card px-5 py-3 shadow-sm"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ACTION_COLOURS[entry.action] ?? "bg-muted text-muted-foreground"}`}
                  >
                    {entry.action}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {entry.target_type}/{entry.target_id.slice(0, 8)}…
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  by {entry.actor_name ?? `${entry.actor_id.slice(0, 8)}…`}
                  {entry.detail !== "{}" ? ` · ${entry.detail}` : ""}
                </p>
              </div>
              <time
                dateTime={entry.created_at}
                className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
              >
                {formatDateTime(entry.created_at)}
              </time>
            </li>
          ))}
        </ul>
      )}

      {entries.length === (page + 1) * PAGE_SIZE ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className={pillClass()}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ── Shared helpers ────────────────────────────────────────────────────── */
function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs font-medium">
        {label}
      </Label>
      {children}
    </div>
  );
}
