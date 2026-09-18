import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  fetchVerificationQueue,
  reviewVerification,
  type VerificationRequest,
} from "../../lib/verification";
import { formatDate } from "../../lib/utils";
import { Avatar } from "../Avatar";
import { pillClass, primaryPillClass } from "../PageChrome";
import { Alert, AlertDescription } from "../ui/alert";
import { EmptyCard } from "./EmptyCard";

/**
 * The photo verification queue.
 *
 * The job is a visual comparison — the uploaded photo against the profile
 * picture — so both are shown side by side at a size you can actually judge.
 * The photo comes from a private bucket through a short-lived signed URL, so
 * it expires shortly after the page is loaded; reloading mints a fresh one.
 */
export function VerificationPanel() {
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setRequests(await fetchVerificationQueue());
    } catch {
      toast.error("Could not load the verification queue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function decide(request: VerificationRequest, approve: boolean) {
    setBusyId(request.id);
    try {
      const result = await reviewVerification({
        data: { requestId: request.id, approve },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(approve ? "Verified." : "Rejected.");
      await load();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3" aria-busy>
        {[1, 2].map((i) => (
          <div key={i} className="h-44 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <AlertDescription>
          Approve only when the photo is plainly the same person as the profile
          picture. The badge says a moderator checked — it is not a judgement
          about whether someone is safe to meet.
        </AlertDescription>
      </Alert>

      {requests.length === 0 ? (
        <EmptyCard text="Nothing waiting for review." />
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((request) => (
            <li
              key={request.id}
              className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-3">
                <Avatar
                  name={request.display_name}
                  url={request.avatar_url}
                  size="sm"
                  tone="muted"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {request.display_name ?? "(no name)"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Requested {formatDate(request.created_at)}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <figure className="flex flex-col gap-1.5">
                  <figcaption className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Profile picture
                  </figcaption>
                  {request.avatar_url ? (
                    <img
                      src={request.avatar_url}
                      alt=""
                      className="aspect-square w-full rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
                      No profile picture
                    </div>
                  )}
                </figure>
                <figure className="flex flex-col gap-1.5">
                  <figcaption className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Verification photo
                  </figcaption>
                  {request.photo_url ? (
                    <img
                      src={request.photo_url}
                      alt=""
                      className="aspect-square w-full rounded-xl object-cover"
                    />
                  ) : (
                    // Either the signed URL expired or the service-role key is
                    // not configured on this deployment. Say which rather than
                    // showing a broken image.
                    <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-dashed border-destructive/40 px-3 text-center text-xs text-muted-foreground">
                      Photo unavailable — reload the page, or check that
                      SUPABASE_SERVICE_ROLE_KEY is set.
                    </div>
                  )}
                </figure>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyId === request.id || !request.photo_url}
                  onClick={() => void decide(request, true)}
                  className={primaryPillClass("text-xs")}
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busyId === request.id}
                  onClick={() => void decide(request, false)}
                  className={pillClass("text-xs", { danger: true })}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
