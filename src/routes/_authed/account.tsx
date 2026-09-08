import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
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
  const [status, setStatus] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
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
    // Build the file in the browser: the data never leaves the user's session.
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
    <div className="flex max-w-xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Account
        </h1>
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="text-foreground">{user.email}</span>
          {user.isAdmin ? " · administrator" : ""}
        </p>
      </div>

      {!profile ? (
        <Alert variant="destructive">
          <AlertDescription>
            No profile row was found for this account. If the migrations were
            applied after you signed up, the profile trigger did not run for you
            — sign up again or insert the row manually.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            {status ? (
              <Alert
                variant={status.kind === "err" ? "destructive" : "default"}
              >
                <AlertDescription>{status.text}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-col gap-2">
              <Label htmlFor="displayName">Name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How others see you"
              />
            </div>

            <Button type="submit" disabled={busy} className="w-fit">
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </form>

          <dl className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-card p-4">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Date of birth
              </dt>
              <dd className="mt-1 text-sm tabular-nums text-foreground">
                {profile.date_of_birth}{" "}
                <span className="text-muted-foreground">
                  ({ageFrom(profile.date_of_birth)} years)
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Member since
              </dt>
              <dd className="mt-1 text-sm tabular-nums text-foreground">
                {profile.created_at.slice(0, 10)}
              </dd>
            </div>
          </dl>

          <section className="flex flex-col gap-3 border-t border-border pt-6">
            <h2 className="text-base font-semibold text-foreground">
              Blocked people
            </h2>
            {blocks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You have not blocked anyone. Blocking someone hides their
                messages and stops them contacting you.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {blocks.map((person) => (
                  <li
                    key={person.id}
                    className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2"
                  >
                    <span className="text-sm text-foreground">
                      {person.name}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleUnblock(person.id)}
                    >
                      Unblock
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-2 border-t border-border pt-6">
            <h2 className="text-base font-semibold text-foreground">
              Your data
            </h2>
            <p className="text-sm text-muted-foreground">
              Download everything NewPop holds about you — profile, bookings,
              reviews, favourites, reports, donations and messages — as a JSON
              file.
            </p>
            <Button
              variant="outline"
              onClick={handleExport}
              className="mt-2 w-fit"
            >
              Download my data
            </Button>
          </section>
        </>
      )}
    </div>
  );
}
