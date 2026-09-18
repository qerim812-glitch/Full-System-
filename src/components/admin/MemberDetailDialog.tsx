import { ShieldCheck, ShieldOff } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  deleteMember,
  fetchMemberDetail,
  setMemberAdmin,
  type AdminMember,
  type MemberDetail,
} from "../../lib/admin";
import { formatBookingDate, formatDate } from "../../lib/utils";
import { Avatar } from "../Avatar";
import { ConfirmButton } from "../ConfirmButton";
import { pillClass, primaryPillClass } from "../PageChrome";
import { StatChip } from "../StatChip";
import { Alert, AlertDescription } from "../ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

/**
 * Everything about one member, with the account-level actions that are too
 * dangerous to sit in a list row.
 *
 * Deletion asks for the member's email typed out rather than a single
 * confirm click: it cascades across bookings, reviews, messages and
 * connections and cannot be undone, and the server checks the same thing
 * again so a modified client cannot skip it.
 */
export function MemberDetailDialog({
  member,
  open,
  onOpenChange,
  onChanged,
}: {
  member: AdminMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void | Promise<void>;
}) {
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");

  const memberId = member?.id ?? null;

  useEffect(() => {
    if (!open || !memberId) return;
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    setConfirmEmail("");
    fetchMemberDetail({ data: { userId: memberId } })
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load that member.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, memberId]);

  async function toggleAdmin() {
    if (!detail) return;
    setBusy(true);
    try {
      const result = await setMemberAdmin({
        data: { userId: detail.profile.id, admin: !detail.isAdmin },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        detail.isAdmin
          ? `Admin removed. ${result.note}`
          : `Admin granted. ${result.note}`,
      );
      setDetail({ ...detail, isAdmin: !detail.isAdmin });
      await onChanged();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!detail) return;
    setBusy(true);
    try {
      const result = await deleteMember({
        data: { userId: detail.profile.id, confirmEmail },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Account deleted.");
      onOpenChange(false);
      await onChanged();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const name = member?.display_name ?? member?.email ?? "Member";
  const emailMatches =
    confirmEmail.trim().length > 0 &&
    confirmEmail.trim().toLowerCase() ===
      (detail?.profile.email ?? "").toLowerCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar
              name={name}
              url={detail?.profile.avatar_url ?? null}
              size="sm"
              tone="muted"
            />
            <span className="truncate">{name}</span>
            {detail?.isAdmin ? (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
                Admin
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {member?.email}
            {member ? ` · Joined ${formatDate(member.created_at)}` : ""}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col gap-3" aria-busy>
            <div className="h-16 animate-pulse rounded-xl bg-muted" />
            <div className="h-32 animate-pulse rounded-xl bg-muted" />
          </div>
        ) : !detail ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            That member could not be loaded.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {detail.stats ? (
              <div className="flex flex-wrap gap-2">
                <StatChip
                  size="sm"
                  label="Bookings"
                  value={String(detail.stats.bookings_total)}
                />
                <StatChip
                  size="sm"
                  label="Cancelled"
                  value={String(detail.stats.bookings_cancelled)}
                />
                <StatChip
                  size="sm"
                  label="Reviews"
                  value={String(detail.stats.reviews_total)}
                />
                <StatChip
                  size="sm"
                  label="Connections"
                  value={String(detail.stats.connections_total)}
                />
                <StatChip
                  size="sm"
                  label="Reports filed"
                  value={String(detail.stats.reports_filed)}
                />
                <StatChip
                  size="sm"
                  label="Reports against"
                  value={String(detail.stats.reports_received)}
                  accent={detail.stats.reports_received > 0}
                />
              </div>
            ) : null}

            <section className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recent bookings
              </h4>
              {detail.recentBookings.length === 0 ? (
                <p className="text-sm text-muted-foreground">None yet.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {detail.recentBookings.map((booking) => (
                    <li
                      key={booking.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-xs"
                    >
                      <span className="font-medium text-foreground">
                        {booking.venue_name ?? booking.venue_slug}
                      </span>
                      <span className="text-muted-foreground">
                        {formatBookingDate(booking.booking_date)} ·{" "}
                        {booking.booking_time} · {booking.party_size}p ·{" "}
                        {booking.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recent reviews
              </h4>
              {detail.recentReviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">None yet.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {detail.recentReviews.map((review) => (
                    <li
                      key={review.id}
                      className="rounded-xl border border-border px-3 py-2 text-xs"
                    >
                      <p className="font-medium text-foreground">
                        {review.venue_slug} · {review.rating}/5
                        {review.is_hidden ? (
                          <span className="ml-2 text-destructive">hidden</span>
                        ) : null}
                      </p>
                      {review.comment ? (
                        <p className="mt-0.5 line-clamp-2 text-muted-foreground">
                          {review.comment}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-destructive">
                Account actions
              </h4>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void toggleAdmin()}
                  disabled={busy}
                  className={
                    detail.isAdmin
                      ? pillClass("gap-1.5 text-xs", { danger: true })
                      : primaryPillClass("gap-1.5 text-xs")
                  }
                >
                  {detail.isAdmin ? (
                    <ShieldOff className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {detail.isAdmin ? "Remove admin" : "Make admin"}
                </button>
                <span className="text-[11px] text-muted-foreground">
                  Takes effect when they next sign in.
                </span>
              </div>

              <Alert variant="destructive">
                <AlertDescription>
                  Deleting removes their bookings, reviews, messages and
                  connections permanently. Donations are kept as an anonymous
                  financial record.
                </AlertDescription>
              </Alert>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm-email" className="text-xs">
                  Type <strong>{detail.profile.email}</strong> to confirm
                </Label>
                <Input
                  id="confirm-email"
                  value={confirmEmail}
                  onChange={(event) => setConfirmEmail(event.target.value)}
                  placeholder={detail.profile.email ?? ""}
                  autoComplete="off"
                  className="rounded-xl"
                />
              </div>

              <ConfirmButton
                title={`Delete ${name}?`}
                description="This cannot be undone. Their bookings, reviews, messages and connections are erased."
                confirmLabel="Delete permanently"
                onConfirm={handleDelete}
                disabled={busy || !emailMatches}
                className={pillClass("w-fit text-xs", { danger: true })}
              >
                Delete account
              </ConfirmButton>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
