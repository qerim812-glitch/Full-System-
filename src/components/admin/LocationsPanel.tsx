import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  deleteLocation,
  fetchAdminLocations,
  upsertLocation,
  type AdminLocation,
} from "../../lib/admin";
import { Input } from "../ui/input";
import { ConfirmButton } from "../ConfirmButton";
import { pillClass, primaryPillClass } from "../PageChrome";
import { EmptyCard } from "./EmptyCard";
import { Field } from "./AdminShared";

export function LocationsPanel({ venueSlug }: { venueSlug: string }) {
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
