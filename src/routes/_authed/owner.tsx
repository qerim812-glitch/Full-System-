import { createFileRoute, Link } from "@tanstack/react-router";
import { ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Avatar } from "../../components/Avatar";
import { ConfirmButton } from "../../components/ConfirmButton";
import { EmptyState } from "../../components/EmptyState";
import { LocationsPanel } from "../../components/admin/LocationsPanel";
import { VenueForm } from "../../components/admin/VenuesPanel";
import {
  PageHeader,
  pillClass,
  primaryPillClass,
  RouteError,
} from "../../components/PageChrome";
import { PillTabs, tabPanelProps } from "../../components/PillTabs";
import { StatChip } from "../../components/StatChip";
import { Input } from "../../components/ui/input";
import type { AdminVenue } from "../../lib/admin";
import {
  addVenuePhoto,
  deleteOwnerLocation,
  deleteVenuePhoto,
  fetchMyVenues,
  fetchOwnerBookings,
  fetchOwnerLocations,
  fetchVenuePhotos,
  updateOwnedVenue,
  upsertOwnerLocation,
  VENUE_PHOTO_MAX_BYTES,
  type OwnerBooking,
  type VenuePhoto,
} from "../../lib/owner";
import { pageHead } from "../../lib/seo";
import { formatBookingDate, todayInTirana } from "../../lib/utils";

type Tab = "bookings" | "details" | "branches" | "photos";

/**
 * The venue owner's dashboard: bookings coming up, the venue's details,
 * its branches and its photo gallery — for the venues an admin has
 * appointed this member to (migration 0024).
 */
export const Route = createFileRoute("/_authed/owner")({
  loader: async () => {
    const venues = await fetchMyVenues();
    const today = todayInTirana();
    const first = venues[0];
    const [bookings, photos] = first
      ? await Promise.all([
          fetchOwnerBookings({ data: { venueSlug: first.slug, from: today } }),
          fetchVenuePhotos({ data: { venueSlug: first.slug } }),
        ])
      : [[], []];
    return { venues, bookings, photos, today };
  },
  head: () => pageHead("My venue", "", { noindex: true }),
  errorComponent: () => <RouteError title="Could not load your venue" />,
  component: OwnerPage,
});

const OWNER_LOCATIONS_API = {
  fetch: fetchOwnerLocations,
  upsert: upsertOwnerLocation,
  remove: deleteOwnerLocation,
};

function OwnerPage() {
  const {
    venues,
    bookings: initialBookings,
    photos: initialPhotos,
    today,
  } = Route.useLoaderData();
  const [slug, setSlug] = useState(venues[0]?.slug ?? "");
  const [tab, setTab] = useState<Tab>("bookings");
  const [editing, setEditing] = useState(false);
  const [bookings, setBookings] = useState<OwnerBooking[]>(initialBookings);
  const [photos, setPhotos] = useState<VenuePhoto[]>(initialPhotos);
  const [venueList, setVenueList] = useState<AdminVenue[]>(venues);
  const tabsId = useId();

  const venue = venueList.find((v) => v.slug === slug) ?? null;

  async function reloadVenue(nextSlug: string) {
    const [b, p, v] = await Promise.all([
      fetchOwnerBookings({ data: { venueSlug: nextSlug, from: today } }),
      fetchVenuePhotos({ data: { venueSlug: nextSlug } }),
      fetchMyVenues(),
    ]);
    setBookings(b);
    setPhotos(p);
    setVenueList(v);
  }

  useEffect(() => {
    if (!slug || slug === venues[0]?.slug) return;
    void reloadVenue(slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (venueList.length === 0 || !venue) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="My venue" />
        <EmptyState
          title="You do not manage a venue yet"
          body="An admin can appoint you as the owner of a venue. Once they do, its bookings, details, branches and photos appear here."
        />
      </div>
    );
  }

  const upcomingConfirmed = bookings.filter((b) => b.status === "confirmed");
  const todayBookings = upcomingConfirmed.filter(
    (b) => b.booking_date === today,
  );
  const covers = todayBookings.reduce((n, b) => n + b.party_size, 0);

  const tabs = [
    {
      id: "bookings" as const,
      label: "Bookings",
      badge: upcomingConfirmed.length,
    },
    { id: "details" as const, label: "Details" },
    { id: "branches" as const, label: "Branches" },
    { id: "photos" as const, label: "Photos", badge: photos.length },
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={venue.name}
        subtitle="Your venue dashboard."
        actions={
          <div className="flex flex-wrap gap-2">
            {venueList.length > 1 ? (
              <select
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                aria-label="Venue"
                className="h-9 rounded-full border border-border bg-card px-3 text-sm text-foreground"
              >
                {venueList.map((v) => (
                  <option key={v.slug} value={v.slug}>
                    {v.name}
                  </option>
                ))}
              </select>
            ) : null}
            <Link
              to="/venues/$slug"
              params={{ slug: venue.slug }}
              className={pillClass("text-xs")}
            >
              View public page
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap gap-4">
        <StatChip
          label="Tables today"
          value={String(todayBookings.length)}
          accent
        />
        <StatChip label="Guests today" value={String(covers)} />
        <StatChip label="Upcoming" value={String(upcomingConfirmed.length)} />
        <StatChip label="Status" value={venue.is_active ? "Live" : "Hidden"} />
      </div>

      <PillTabs tabs={tabs} value={tab} onChange={setTab} label="Sections" />

      {tab === "bookings" ? (
        <div {...tabPanelProps(tabsId, "bookings")}>
          {bookings.length === 0 ? (
            <EmptyState
              title="No upcoming bookings"
              body="Reservations members make at your venue appear here, soonest first."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {bookings.map((b) => (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-5 py-3.5 shadow-sm"
                >
                  <Avatar
                    name={b.guest_name}
                    url={b.guest_avatar}
                    size="sm"
                    tone="muted"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {b.guest_name}
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {b.party_size}{" "}
                        {b.party_size === 1 ? "guest" : "guests"}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatBookingDate(b.booking_date)} · {b.booking_time}
                    </p>
                  </div>
                  <span
                    className={
                      b.status === "confirmed"
                        ? "rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-accent-foreground"
                        : "rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold capitalize text-muted-foreground"
                    }
                  >
                    {b.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === "details" ? (
        <div
          {...tabPanelProps(tabsId, "details")}
          className="flex flex-col gap-4"
        >
          {editing ? (
            <VenueForm
              initial={venue}
              save={updateOwnedVenue}
              onClose={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                void reloadVenue(venue.slug);
              }}
            />
          ) : (
            <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <Detail label="Category" value={venue.category} />
                <Detail
                  label="Hours"
                  value={`${venue.opens_at}–${venue.closes_at}, ${venue.slot_minutes} min slots`}
                />
                <Detail label="Address" value={venue.address ?? "—"} />
                <Detail label="Phone" value={venue.phone ?? "—"} />
                <Detail
                  label="Ages"
                  value={`${venue.min_age}–${venue.max_age}`}
                />
                <Detail label="Seats per slot" value={String(venue.capacity)} />
              </dl>
              <p className="text-sm text-muted-foreground">
                {venue.description}
              </p>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className={primaryPillClass("w-fit text-xs")}
              >
                Edit details
              </button>
            </div>
          )}
        </div>
      ) : null}

      {tab === "branches" ? (
        <div {...tabPanelProps(tabsId, "branches")}>
          <LocationsPanel venueSlug={venue.slug} api={OWNER_LOCATIONS_API} />
        </div>
      ) : null}

      {tab === "photos" ? (
        <div {...tabPanelProps(tabsId, "photos")}>
          <PhotosManager
            venueSlug={venue.slug}
            photos={photos}
            onChanged={() => reloadVenue(venue.slug)}
          />
        </div>
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="capitalize text-foreground">{value}</dd>
    </div>
  );
}

/** Upload, caption and delete gallery photos. */
export function PhotosManager({
  venueSlug,
  photos,
  onChanged,
}: {
  venueSlug: string;
  photos: VenuePhoto[];
  onChanged: () => void | Promise<void>;
}) {
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > VENUE_PHOTO_MAX_BYTES) {
      toast.error("Photos must be under 5 MB.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("venueSlug", venueSlug);
      form.append("caption", caption);
      form.append("photo", file);
      const result = await addVenuePhoto({ data: form });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setCaption("");
      toast.success("Photo added.");
      await onChanged();
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    const result = await deleteVenuePhoto({ data: { id } });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    await onChanged();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label
            htmlFor="photo-caption"
            className="text-xs font-medium text-muted-foreground"
          >
            Caption for the next photo (optional)
          </label>
          <Input
            id="photo-caption"
            value={caption}
            maxLength={200}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="The terrace at sunset"
            className="rounded-xl"
          />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => void handleFile(e)}
          className="sr-only"
          aria-label="Choose a photo"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className={primaryPillClass("gap-1.5")}
        >
          <ImagePlus className="h-4 w-4" aria-hidden />
          {busy ? "Uploading…" : "Upload photo"}
        </button>
      </div>

      {photos.length === 0 ? (
        <EmptyState
          title="No photos yet"
          body="Show people the room, the terrace, the drinks. Photos appear on your public page."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo) => (
            <li
              key={photo.id}
              className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
            >
              <img
                src={photo.url}
                alt={photo.caption ?? ""}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover"
              />
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="truncate text-xs text-muted-foreground">
                  {photo.caption ?? "No caption"}
                </span>
                <ConfirmButton
                  title="Delete this photo?"
                  description="It is removed from your public page."
                  confirmLabel="Delete"
                  onConfirm={() => handleDelete(photo.id)}
                  className="rounded-full p-1.5 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  <span className="sr-only">Delete photo</span>
                </ConfirmButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
