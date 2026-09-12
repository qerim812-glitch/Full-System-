import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "../../components/ui/alert";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { fetchMyBlocks, unblockUser } from "../../lib/messaging";
import {
  exportMyData,
  fetchMyProfile,
  updateAvatarUrl,
  updateProfile,
} from "../../lib/profile";
import { getSupabaseBrowserClient } from "../../lib/supabase/browser";

export const Route = createFileRoute("/_authed/account")({
  loader: async () => {
    const [profile, blocks] = await Promise.all([
      fetchMyProfile(),
      fetchMyBlocks(),
    ]);
    return { profile, blocks };
  },
  pendingComponent: AccountSkeleton,
  errorComponent: () => (
    <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      <h2 className="text-base font-semibold text-foreground">
        Could not load account
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Refresh the page to try again.
      </p>
    </div>
  ),
  component: AccountPage,
});

function AccountSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
      <div className="flex gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 w-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-56 animate-pulse rounded-2xl bg-muted" />
      <div className="h-32 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}

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
  const [status, setStatus] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    profile?.avatar_url ?? null,
  );
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /* ── Change password ─────────────────────────────────────────── */
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwStatus, setPwStatus] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2 MB");
      return;
    }

    setAvatarBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) {
        toast.error("Not signed in");
        return;
      }

      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `avatars/${authUser.id}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) {
        toast.error("Upload failed: " + uploadError.message);
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(path);
      const urlWithBust = publicUrl + "?t=" + Date.now();

      const saveResult = await updateAvatarUrl({ data: { avatarUrl: publicUrl } });
      if (!saveResult.ok) {
        toast.error(saveResult.error);
        return;
      }

      setAvatarUrl(urlWithBust);
      toast.success("Avatar updated!");
    } finally {
      setAvatarBusy(false);
    }
  }

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

  async function handleChangePassword(event: React.FormEvent) {
    event.preventDefault();
    setPwStatus(null);

    if (newPw.length < 8) {
      setPwStatus({ kind: "err", text: "New password must be at least 8 characters." });
      return;
    }
    if (newPw !== confirmPw) {
      setPwStatus({ kind: "err", text: "The two passwords do not match." });
      return;
    }

    setPwBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();

      // Re-authenticate with current password first
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser?.email) {
        setPwStatus({ kind: "err", text: "Could not identify your account. Please sign in again." });
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: authUser.email,
        password: currentPw,
      });
      if (signInError) {
        setPwStatus({ kind: "err", text: "Current password is incorrect." });
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPw,
      });
      if (updateError) {
        setPwStatus({ kind: "err", text: updateError.message });
        return;
      }

      setPwStatus({ kind: "ok", text: "Password changed successfully." });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } finally {
      setPwBusy(false);
    }
  }

  async function handleUnblock(userId: string) {
    const result = await unblockUser({ data: { userId } });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    await router.invalidate();
  }

  async function handleExport() {
    const data = await exportMyData();
    if (!data) {
      toast.error("Could not build your export. Please sign in again.");
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
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
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Account
        </h1>
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
            <StatChip
              label="Age"
              value={`${ageFrom(profile.date_of_birth)} yrs`}
              accent
            />
            <StatChip label="Date of birth" value={profile.date_of_birth} />
            <StatChip
              label="Member since"
              value={profile.created_at.slice(0, 7)}
            />
            <StatChip label="Blocked" value={String(blocks.length)} />
          </div>

          {/* ── Profile form ─────────────────────────────────────── */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-foreground">
              Profile
            </h2>

            {/* Avatar */}
            <div className="mb-5 flex items-center gap-4">
              <div className="relative h-16 w-16 shrink-0">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Your avatar"
                    className="h-16 w-16 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-2xl font-bold text-accent-foreground">
                    {(
                      (profile.display_name ?? user.email ?? "?")[0] ?? "?"
                    ).toUpperCase()}
                  </div>
                )}
                {avatarBusy && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60">
                    <svg
                      className="h-5 w-5 animate-spin text-muted-foreground"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v8H4z"
                      />
                    </svg>
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {profile.display_name ?? "(no name)"}
                </p>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={avatarBusy}
                  className="mt-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-all hover:border-foreground/20 hover:text-foreground disabled:opacity-50"
                >
                  {avatarBusy ? "Uploading…" : "Change photo"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  JPG, PNG or WebP · max 2 MB
                </p>
              </div>
            </div>

            {status ? (
              <Alert
                variant={status.kind === "err" ? "destructive" : "default"}
                className="mb-4"
              >
                <AlertDescription>{status.text}</AlertDescription>
              </Alert>
            ) : null}

            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="displayName" className="text-xs font-medium">
                  Display name
                </Label>
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

          {/* ── Change password ──────────────────────────────────── */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-1 text-base font-semibold text-foreground">
              Change password
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Enter your current password to confirm, then choose a new one.
            </p>

            {pwStatus ? (
              <Alert
                variant={pwStatus.kind === "err" ? "destructive" : "default"}
                className="mb-4"
              >
                <AlertDescription>{pwStatus.text}</AlertDescription>
              </Alert>
            ) : null}

            <form
              onSubmit={handleChangePassword}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="currentPw" className="text-xs font-medium">
                  Current password
                </Label>
                <Input
                  id="currentPw"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="newPw" className="text-xs font-medium">
                  New password
                </Label>
                <Input
                  id="newPw"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="At least 8 characters"
                  className="rounded-xl"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirmPw" className="text-xs font-medium">
                  Confirm new password
                </Label>
                <Input
                  id="confirmPw"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <button
                type="submit"
                disabled={pwBusy}
                className="w-fit rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {pwBusy ? "Updating…" : "Update password"}
              </button>
            </form>
          </div>

          {/* ── Blocked people ───────────────────────────────────── */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-foreground">
              Blocked people
            </h2>
            {blocks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You haven't blocked anyone. Blocking hides their messages and
                stops them contacting you.
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
                      <span className="text-sm text-foreground">
                        {person.name}
                      </span>
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
            <h2 className="mb-2 text-base font-semibold text-foreground">
              Your data
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Download everything NewPop holds about you — profile, bookings,
              reviews, favourites, reports, donations and messages — as a JSON
              file.
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
        accent
          ? "bg-accent text-accent-foreground"
          : "border border-border bg-card"
      }`}
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold leading-none text-foreground">
        {value}
      </span>
    </div>
  );
}
