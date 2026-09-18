import { useRouter } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { setVenueActive, upsertVenue, type AdminVenue } from "../../lib/admin";
import { VENUE_CATEGORIES } from "../../lib/venue-filters";
import { Alert, AlertDescription } from "../ui/alert";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { ConfirmButton } from "../ConfirmButton";
import { pillClass, primaryPillClass } from "../PageChrome";
import { EmptyCard } from "./EmptyCard";
import { Field } from "./AdminShared";
import { LocationsPanel } from "./LocationsPanel";
import type { Runner } from "./AdminShared";

export function VenuesPanel({
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
  const [lat, setLat] = useState(
    initial?.lat != null ? String(initial.lat) : "",
  );
  const [lng, setLng] = useState(
    initial?.lng != null ? String(initial.lng) : "",
  );

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
          // Empty means "no coordinates", which the schema and the database
          // both require to be both-or-neither.
          lat: lat.trim() === "" ? null : Number(lat),
          lng: lng.trim() === "" ? null : Number(lng),
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
        <Field label="Latitude" id="lat">
          <Input
            id="lat"
            inputMode="decimal"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="41.327500"
            className="rounded-xl"
          />
        </Field>

        <Field label="Longitude" id="lng">
          <Input
            id="lng"
            inputMode="decimal"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            placeholder="19.818700"
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
