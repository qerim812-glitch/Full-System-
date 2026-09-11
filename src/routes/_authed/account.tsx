import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "../../components/ui/alert";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { fetchMyBlocks, unblockUser } from "../../lib/messaging";
import { exportMyData, fetchMyProfile, updateProfile } from "../../lib/profile";

export const Route = createFileRoute("/_authed/account")({
  loader: async () => {
    const [profile, blocks] = await Promise.all([
      fetchMyProfile(),
      fetchMyBlocks(),
    ]);
    return { profile, blocks };
  },
  component: AccountPage,
});

function ageFrom(iso: string): number {
  const dob = new Date(`${iso}T00:00:00Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

function AccountPage() {
  const { profile, blocks } = Route.useLoaderData();
  const { user } = Route.useRouteContext();
  const router = useRouter();

  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    const result = await updateProfile({ data: { displayName } });
    setStatus(
      result.ok
        ? { kind: "ok", text: "Saved." }
        : { kind: "err", text: result.error },
    );
    if (result.ok) await router.invalidate();
    setBusy(false);
  }

  async function handleUnblock(userId: string) {
    const result = await unblockUser({ data: { userId } });
    if (!result.ok) { toast.error(result.error); return; }
    await router.invalidate();
  }

  async function handleExport() {
    const data = await exportMyData();
    if (!data) { toast.error("Could not build your export. Please sign in again."); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `newpop-my-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-8">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Account</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as{" "}
          <span className="font-medium text-foreground">{user.email}</span>
          {user.isAdmin ? (
            <span className="ml-2 rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">
              Admin
            </span>
          ) : null}
        </p>
      </div>

      {!profile ? (
        <Alert variant="destructive">
          <AlertDescription>
            No profile row was found for this account. If the migrations were
            applied after you signed up, the profile trigger did not run — sign
            up again or insert the row manually.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {/* ── Stats strip ─────────────────────────────────────── */}
          <div className="flex flex-wrap gap-4">
            <StatChip label="Age" value={`${ageFrom(profile.date_of_birth)} yrs`} accent />
            <StatChip label="Date of birth" value={profile.date_of_birth} />
            <StatChip label="Member since" value={profile.created_at.slice(0, 7)} />
            <StatChip label="Blocked" value={String(blocks.length)} />
          </div>

          {/* ── Profile form ─────────────────────────────────────── */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-foreground">Profile</h2>

            {status ? (
              <Alert variant={status.kind === "err" ? "destructive" : "default"} className="mb-4">
                <AlertDescription>{status.text}</AlertDescription>
              </Alert>
            ) : null}

            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="displayName" className="text-xs font-medium">Display name</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How others see you"
                  className="rounded-xl"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-fit rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
            </form>
          </div>

          {/* ── Blocked people ───────────────────────────────────── */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-foreground">Blocked people</h2>
            {blocks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You haven't blocked anyone. Blocking hides their messages and stops them contacting you.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {blocks.map((person) => (
                  <li
                    key={person.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                        {((person.name ?? "?")[0] ?? "?").toUpperCase()}
                      </div>
                      <span className="text-sm text-foreground">{person.name}</span>
                    </div>
                    <button
                      onClick={() => void handleUnblock(person.id)}
                      className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-all hover:border-foreground/20 hover:text-foreground"
                    >
                      Unblock
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Data export ──────────────────────────────────────── */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-2 text-base font-semibold text-foreground">Your data</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Download everything NewPop holds about you — profile, bookings, reviews,
              favourites, reports, donations and messages — as a JSON file.
            </p>
            <button
              onClick={handleExport}
              className="rounded-full border border-border bg-background px-5 py-2 text-sm font-medium text-foreground shadow-sm transition-all hover:border-foreground/20"
            >
              Download my data
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function StatChip({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex min-w-[7rem] flex-col gap-0.5 rounded-2xl px-5 py-3 shadow-sm ${
        accent ? "bg-accent text-accent-foreground" : "border border-border bg-card"
      }`}
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold leading-none text-foreground">{value}</span>
    </div>
  );
}
