import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Avatar } from "../../components/Avatar";
import { ConfirmButton } from "../../components/ConfirmButton";
import {
  PageHeader,
  RouteError,
  pillClass,
  primaryPillClass,
} from "../../components/PageChrome";
import { StatChipSkeleton } from "../../components/Skeletons";
import { StatChip } from "../../components/StatChip";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { changePassword } from "../../lib/auth";
import { fetchMyBlocks, unblockUser } from "../../lib/messaging";
import {
  deleteMyAccount,
  exportMyData,
  fetchMyProfile,
  removeAvatar,
  updateProfile,
  uploadAvatar,
} from "../../lib/profile";
import { pageHead } from "../../lib/seo";
import { fixMissingProfile } from "../../lib/social";
import { ageFromDob, formatBookingDate, formatDate } from "../../lib/utils";

export const Route = createFileRoute("/_authed/account")({
  loader: async () => {
    const [profile, blocks] = await Promise.all([
      fetchMyProfile(),
      fetchMyBlocks(),
    ]);
    return { profile, blocks };
  },
  head: () => pageHead("Account", undefined, { noindex: true }),
  pendingComponent: () => (
    <div className="flex flex-col gap-8" aria-busy>
      <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
      <StatChipSkeleton count={4} />
      <div className="h-56 animate-pulse rounded-2xl bg-muted" />
      <div className="h-32 animate-pulse rounded-2xl bg-muted" />
    </div>
  ),
  errorComponent: () => <RouteError title="Could not load account" />,
  component: AccountPage,
});

type Status = { kind: "ok" | "err"; text: string } | null;

function AccountPage() {
  const { profile, blocks } = Route.useLoaderData();
  const { user } = Route.useRouteContext();
  const router = useRouter();

  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    profile?.avatar_url ?? null,
  );
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwStatus, setPwStatus] = useState<Status>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const [deleteText, setDeleteText] = useState("");

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2 MB.");
      return;
    }
    setAvatarBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await uploadAvatar({ data: form });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setAvatarUrl(result.avatarUrl);
      toast.success("Photo updated.");
      await router.invalidate();
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleRemoveAvatar() {
    setAvatarBusy(true);
    try {
      const result = await removeAvatar();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setAvatarUrl(null);
      await router.invalidate();
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const result = await updateProfile({ data: { displayName } });
      setStatus(
        result.ok
          ? { kind: "ok", text: "Saved." }
          : { kind: "err", text: result.error },
      );
      if (result.ok) await router.invalidate();
    } catch (err) {
      setStatus({
        kind: "err",
        text: err instanceof Error ? err.message : "Could not save.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleChangePassword(event: React.FormEvent) {
    event.preventDefault();
    setPwStatus(null);
    if (newPw.length < 8) {
      setPwStatus({
        kind: "err",
        text: "New password must be at least 8 characters.",
      });
      return;
    }
    if (newPw !== confirmPw) {
      setPwStatus({ kind: "err", text: "The two passwords do not match." });
      return;
    }
    setPwBusy(true);
    try {
      const result = await changePassword({
        data: { currentPassword: currentPw, newPassword: newPw },
      });
      if (!result.ok) {
        setPwStatus({ kind: "err", text: result.error });
        return;
      }
      setPwStatus({ kind: "ok", text: "Password changed." });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch {
      setPwStatus({ kind: "err", text: "Could not reach the server." });
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
    try {
      const json = await exportMyData();
      if (!json) {
        toast.error("Could not build your export. Please sign in again.");
        return;
      }
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `newpop-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not build your export.");
    }
  }

  async function handleDelete() {
    const result = await deleteMyAccount({ data: { confirm: "DELETE" } });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Your account has been deleted.");
    await router.invalidate();
    await router.navigate({ to: "/login" });
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Account"
        subtitle={
          <>
            Signed in as{" "}
            <span className="font-medium text-foreground">{user.email}</span>
            {user.isAdmin ? (
              <span className="ml-2 rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">
                Admin
              </span>
            ) : null}
          </>
        }
      />

      {!profile ? (
        <NoProfileCard onFixed={() => router.invalidate()} />
      ) : (
        <>
          <div className="flex flex-wrap gap-4">
            <StatChip
              label="Age"
              value={`${ageFromDob(profile.date_of_birth)} yrs`}
              accent
            />
            <StatChip
              label="Date of birth"
              value={formatBookingDate(profile.date_of_birth)}
            />
            <StatChip
              label="Member since"
              value={formatDate(profile.created_at)}
            />
            <StatChip label="Blocked" value={String(blocks.length)} />
          </div>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-foreground">
              Profile
            </h2>

            <div className="mb-5 flex flex-wrap items-center gap-4">
              <div className="relative">
                <Avatar
                  name={profile.display_name ?? user.email}
                  url={avatarUrl}
                  size="lg"
                />
                {avatarBusy ? (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60">
                    <Loader2
                      className="h-5 w-5 animate-spin text-muted-foreground"
                      aria-hidden
                    />
                    <span className="sr-only">Uploading</span>
                  </div>
                ) : null}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {profile.display_name ?? "(no name)"}
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={avatarBusy}
                    className={pillClass("text-xs")}
                  >
                    {avatarBusy ? "Uploading…" : "Change photo"}
                  </button>
                  {avatarUrl ? (
                    <button
                      type="button"
                      onClick={() => void handleRemoveAvatar()}
                      disabled={avatarBusy}
                      className={pillClass("text-xs")}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  aria-label="Choose a profile photo"
                  onChange={(e) => void handleAvatarChange(e)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
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
                  minLength={2}
                  maxLength={60}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How others see you"
                  className="rounded-xl"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className={primaryPillClass("w-fit")}
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
            </form>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
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
                className={primaryPillClass("w-fit")}
              >
                {pwBusy ? "Updating…" : "Update password"}
              </button>
            </form>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
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
                    <span className="flex items-center gap-3">
                      <Avatar
                        name={person.name}
                        url={person.avatar_url}
                        size="sm"
                        tone="muted"
                      />
                      <span className="text-sm text-foreground">
                        {person.name}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleUnblock(person.id)}
                      className={pillClass("text-xs")}
                    >
                      Unblock
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-2 text-base font-semibold text-foreground">
              Your data
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Download everything NewPop holds about you — profile, bookings,
              reviews, favourites, connections, reports, donations,
              notifications and messages — as a JSON file.
            </p>
            <button
              type="button"
              onClick={() => void handleExport()}
              className={pillClass("text-foreground")}
            >
              Download my data
            </button>
          </section>

          <section className="rounded-2xl border border-destructive/30 bg-card p-6 shadow-sm">
            <h2 className="mb-2 text-base font-semibold text-foreground">
              Delete account
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Permanently removes your profile, bookings, reviews, messages and
              connections. This cannot be undone. Type <strong>DELETE</strong>{" "}
              to enable the button.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                aria-label="Type DELETE to confirm"
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                placeholder="DELETE"
                className="w-40 rounded-xl"
              />
              <ConfirmButton
                title="Delete your account?"
                description="Everything tied to this account is erased immediately. You will be signed out."
                confirmLabel="Delete forever"
                onConfirm={handleDelete}
                disabled={deleteText !== "DELETE"}
                className={pillClass("text-xs", { danger: true })}
              >
                Delete my account
              </ConfirmButton>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function NoProfileCard({ onFixed }: { onFixed: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFix() {
    setBusy(true);
    setError(null);
    try {
      const result = await fixMissingProfile();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Profile created.");
      onFixed();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="mb-2 text-base font-semibold text-foreground">
        Finish setting up your profile
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Your account exists but has no profile yet. Click below to create it
        from your sign-up details.
      </p>
      {error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <button
        type="button"
        onClick={() => void handleFix()}
        disabled={busy}
        className={primaryPillClass()}
      >
        {busy ? "Creating…" : "Create my profile"}
      </button>
    </div>
  );
}
