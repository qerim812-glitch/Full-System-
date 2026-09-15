import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "../../components/ui/alert";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  fetchAdminBookings,
  fetchAdminOverview,
  fetchAdminVenues,
  fetchAuditLog,
  fetchMembers,
  fetchPendingDonations,
  fetchReportQueue,
  resolveReport,
  setBookingStatus,
  setDonationStatus,
  setUserSuspended,
  setVenueActive,
  upsertVenue,
  type AdminBooking,
  type AdminMember,
  type AdminVenue,
  type AuditEntry,
} from "../../lib/admin";
import { formatAmount } from "../../lib/donations";
import { StatChip } from "../../components/StatChip";

type Tab =
  "reports" | "donations" | "bookings" | "venues" | "members" | "audit";

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
  component: AdminPage,
});

function AdminPage() {
  const { overview, reports, donations, venues, members, bookings } =
    Route.useLoaderData();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("reports");
  const [busyId, setBusyId] = useState<string | null>(null);

  /* ── Report actions ─────────────────────────────────────────────── */
  async function act(id: string, status: "actioned" | "dismissed") {
    setBusyId(id);
    try {
      const result = await resolveReport({ data: { id, status } });
      if (!result.ok) toast.error(result.error);
      await router.invalidate();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusyId(null);
    }
  }

  /* ── Donation actions ───────────────────────────────────────────── */
  async function decide(id: string, status: "confirmed" | "failed") {
    setBusyId(id);
    try {
      const result = await setDonationStatus({ data: { id, status } });
      if (!result.ok) toast.error(result.error);
      await router.invalidate();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusyId(null);
    }
  }

  /* ── Member actions ─────────────────────────────────────────────── */
  async function suspend(userId: string, suspended: boolean) {
    setBusyId(userId);
    try {
      const result = await setUserSuspended({ data: { userId, suspended } });
      if (!result.ok) toast.error(result.error);
      else toast.success(suspended ? "Member suspended" : "Member reinstated");
      await router.invalidate();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusyId(null);
    }
  }

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: "reports", label: "Reports", badge: reports.length },
    { id: "donations", label: "Donations", badge: donations.length },
    { id: "bookings", label: "Bookings" },
    { id: "venues", label: "Venues" },
    { id: "members", label: "Members" },
    { id: "audit", label: "Audit log" },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Admin
        </h1>
        <p className="text-sm text-muted-foreground">
          Live counts from the database. Every action is written to the audit
          log.
        </p>
      </div>

      {/* ── Stats strip ────────────────────────────────────────── */}
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

      {/* ── Tab pills ──────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
              activeTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-foreground">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Reports tab ────────────────────────────────────────── */}
      {activeTab === "reports" && (
        <section className="flex flex-col gap-3">
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
                      {report.description && (
                        <p className="text-sm text-muted-foreground">
                          {report.description}
                        </p>
                      )}
                      <p className="text-xs tabular-nums text-muted-foreground">
                        Filed {report.created_at.slice(0, 10)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {reportedUserId && (
                        <ActionButton
                          label="Suspend member"
                          busy={busyId === reportedUserId}
                          onClick={() => void suspend(reportedUserId, true)}
                          variant="danger"
                        />
                      )}
                      <ActionButton
                        label="Dismiss"
                        busy={busyId === report.id}
                        onClick={() => void act(report.id, "dismissed")}
                      />
                      <ActionButton
                        label="Take action"
                        busy={busyId === report.id}
                        onClick={() => void act(report.id, "actioned")}
                        variant="primary"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* ── Donations tab ──────────────────────────────────────── */}
      {activeTab === "donations" && (
        <section className="flex flex-col gap-3">
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
                      {new Date(donation.created_at).toLocaleDateString()}
                      {donation.message ? ` · ${donation.message}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <ActionButton
                      label="Confirm"
                      busy={busyId === donation.id}
                      onClick={() => void decide(donation.id, "confirmed")}
                      variant="primary"
                    />
                    <ActionButton
                      label="Mark failed"
                      busy={busyId === donation.id}
                      onClick={() => void decide(donation.id, "failed")}
                      variant="danger"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── Bookings tab ───────────────────────────────────────── */}
      {activeTab === "bookings" && (
        <BookingsPanel
          initialBookings={bookings}
          busyId={busyId}
          setBusyId={setBusyId}
          onRefresh={() => router.invalidate()}
        />
      )}

      {/* ── Venues tab ─────────────────────────────────────────── */}
      {activeTab === "venues" && (
        <VenuesPanel
          venues={venues}
          busyId={busyId}
          setBusyId={setBusyId}
          onRefresh={() => router.invalidate()}
        />
      )}

      {/* ── Members tab ────────────────────────────────────────── */}
      {activeTab === "members" && (
        <MembersPanel
          initialMembers={members}
          busyId={busyId}
          suspend={suspend}
        />
      )}

      {/* ── Audit log tab ──────────────────────────────────────── */}
      {activeTab === "audit" && <AuditPanel />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Bookings panel — full list with status management + load-more
   ══════════════════════════════════════════════════════════════════════════ */
function BookingsPanel({
  initialBookings,
  busyId,
  setBusyId,
  onRefresh,
}: {
  initialBookings: AdminBooking[];
  busyId: string | null;
  setBusyId: (id: string | null) => void;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [bookings, setBookings] = useState(initialBookings);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 50;

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

  const visible = search.trim()
    ? bookings.filter(
        (b) =>
          b.venue_name?.toLowerCase().includes(search.toLowerCase()) ||
          b.user_name?.toLowerCase().includes(search.toLowerCase()) ||
          b.user_email?.toLowerCase().includes(search.toLowerCase()),
      )
    : bookings;

  async function changeStatus(id: string, status: AdminBooking["status"]) {
    setBusyId(id);
    try {
      const result = await setBookingStatus({ data: { id, status } });
      if (!result.ok) toast.error(result.error);
      else toast.success(`Booking marked ${status}`);
      onRefresh();
      // Optimistic update in local state
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status } : b)),
      );
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusyId(null);
    }
  }

  const STATUS_STYLES: Record<AdminBooking["status"], string> = {
    confirmed: "bg-accent text-accent-foreground",
    completed: "bg-muted text-muted-foreground",
    cancelled: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by venue, name or email…"
            className="h-9 w-72 rounded-full border border-border bg-card pl-9 pr-4 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {visible.length} bookings
        </span>
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
                  {b.booking_date} at {b.booking_time.slice(0, 5)} ·{" "}
                  {b.party_size} {b.party_size === 1 ? "person" : "people"}
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
                {b.status !== "completed" && (
                  <ActionButton
                    label="Complete"
                    busy={busyId === b.id}
                    onClick={() => void changeStatus(b.id, "completed")}
                    variant="primary"
                  />
                )}
                {b.status === "confirmed" && (
                  <ActionButton
                    label="Cancel"
                    busy={busyId === b.id}
                    onClick={() => void changeStatus(b.id, "cancelled")}
                    variant="danger"
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Load more */}
      {bookings.length === (page + 1) * PAGE_SIZE && (
        <div className="flex justify-center">
          <button
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="rounded-full border border-border bg-card px-6 py-2 text-sm font-medium text-muted-foreground shadow-sm transition-all hover:border-foreground/20 hover:text-foreground disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Venues panel — list + add/edit form
   ══════════════════════════════════════════════════════════════════════════ */
function VenuesPanel({
  venues,
  busyId,
  setBusyId,
  onRefresh,
}: {
  venues: AdminVenue[];
  busyId: string | null;
  setBusyId: (id: string | null) => void;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState<AdminVenue | null>(null);
  const [showForm, setShowForm] = useState(false);

  function openAdd() {
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(venue: AdminVenue) {
    setEditing(venue);
    setShowForm(true);
  }

  async function toggleActive(slug: string, is_active: boolean) {
    setBusyId(slug);
    try {
      const result = await setVenueActive({ data: { slug, is_active } });
      if (!result.ok) toast.error(result.error);
      else toast.success(is_active ? "Venue activated" : "Venue deactivated");
      onRefresh();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">
          {venues.length} venue{venues.length !== 1 ? "s" : ""}
        </h2>
        <button
          onClick={openAdd}
          className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          + Add venue
        </button>
      </div>

      {showForm && (
        <VenueForm
          initial={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            onRefresh();
          }}
        />
      )}

      {venues.length === 0 ? (
        <EmptyCard text="No venues yet. Add one above." />
      ) : (
        <ul className="flex flex-col gap-3">
          {venues.map((venue) => (
            <li
              key={venue.slug}
              className="flex flex-wrap items-start gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {venue.name}
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      venue.is_active
                        ? "bg-accent text-accent-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {venue.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {venue.slug} · Ages {venue.min_age}–{venue.max_age} ·{" "}
                  {venue.capacity} seats
                </p>
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {venue.description}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionButton
                  label="Edit"
                  busy={false}
                  onClick={() => openEdit(venue)}
                />
                <ActionButton
                  label={venue.is_active ? "Deactivate" : "Activate"}
                  busy={busyId === venue.slug}
                  onClick={() =>
                    void toggleActive(venue.slug, !venue.is_active)
                  }
                  variant={venue.is_active ? "danger" : "primary"}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Venue add/edit form ─────────────────────────────────────────────────── */
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

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">
          {isEdit ? `Edit ${initial.name}` : "Add new venue"}
        </h3>
        <button
          onClick={onClose}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
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
        <div className="sm:col-span-2">
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
        <Field label="Capacity (seats)" id="capacity">
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

        <div className="flex gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving…" : isEdit ? "Save changes" : "Create venue"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border px-5 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Members panel — with load-more
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

  const visible = search.trim()
    ? members.filter(
        (m) =>
          m.display_name?.toLowerCase().includes(search.toLowerCase()) ||
          m.email?.toLowerCase().includes(search.toLowerCase()),
      )
    : members;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by name or email…"
            className="h-9 w-64 rounded-full border border-border bg-card pl-9 pr-4 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
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
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                  {(
                    (member.display_name ?? member.email ?? "?")[0] ?? "?"
                  ).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {member.display_name ?? "(no name)"}
                    {member.is_suspended && (
                      <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                        Suspended
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.email} · Joined {member.created_at.slice(0, 10)}
                  </p>
                </div>
              </div>
              <ActionButton
                label={member.is_suspended ? "Reinstate" : "Suspend"}
                busy={busyId === member.id}
                onClick={() => void suspend(member.id, !member.is_suspended)}
                variant={member.is_suspended ? "primary" : "danger"}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Load more */}
      {members.length === (page + 1) * PAGE_SIZE && (
        <div className="flex justify-center">
          <button
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="rounded-full border border-border bg-card px-6 py-2 text-sm font-medium text-muted-foreground shadow-sm transition-all hover:border-foreground/20 hover:text-foreground disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Audit log panel
   ══════════════════════════════════════════════════════════════════════════ */
function AuditPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [page, setPage] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 50;

  // Initial load. Was previously kicked off inside render (setState during
  // render), which double-fires in StrictMode and is a hooks-rules violation.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAuditLog({ data: { page: 0 } })
      .then((rows) => {
        if (cancelled) return;
        setEntries(rows);
        setPage(0);
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

  const ACTION_COLOURS: Record<string, string> = {
    "report.actioned": "bg-destructive/10 text-destructive",
    "report.dismissed": "bg-muted text-muted-foreground",
    "donation.confirmed": "bg-accent text-accent-foreground",
    "donation.failed": "bg-destructive/10 text-destructive",
    "user.suspend": "bg-destructive/10 text-destructive",
    "user.unsuspend": "bg-accent text-accent-foreground",
    "venue.activate": "bg-accent text-accent-foreground",
    "venue.deactivate": "bg-muted text-muted-foreground",
    "venue.upsert": "bg-muted text-muted-foreground",
    "booking.cancelled": "bg-destructive/10 text-destructive",
    "booking.completed": "bg-accent text-accent-foreground",
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
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
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                      ACTION_COLOURS[entry.action] ??
                      "bg-muted text-muted-foreground"
                    }`}
                  >
                    {entry.action}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {entry.target_type}/{entry.target_id.slice(0, 8)}…
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  by {entry.actor_name ?? entry.actor_id.slice(0, 8)}…
                  {entry.detail !== "{}" ? ` · ${entry.detail}` : ""}
                </p>
              </div>
              <time
                dateTime={entry.created_at}
                className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
              >
                {new Date(entry.created_at).toLocaleString([], {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </time>
            </li>
          ))}
        </ul>
      )}

      {entries.length === (page + 1) * PAGE_SIZE && (
        <div className="flex justify-center">
          <button
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="rounded-full border border-border bg-card px-6 py-2 text-sm font-medium text-muted-foreground shadow-sm transition-all hover:border-foreground/20 hover:text-foreground disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Shared helpers ────────────────────────────────────────────────────── */

function ActionButton({
  label,
  busy,
  onClick,
  variant = "default",
}: {
  label: string;
  busy: boolean;
  onClick: () => void;
  variant?: "default" | "primary" | "danger";
}) {
  const styles = {
    default:
      "border border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground",
    primary: "bg-primary text-primary-foreground hover:opacity-90",
    danger:
      "border border-destructive/40 text-destructive hover:bg-destructive/10",
  };
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`rounded-full px-4 py-1.5 text-xs font-medium shadow-sm transition-all disabled:opacity-40 ${styles[variant]}`}
    >
      {busy ? "…" : label}
    </button>
  );
}

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
