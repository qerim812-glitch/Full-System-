import { useState } from "react";
import { toast } from "sonner";

import {
  fileReport,
  REPORT_REASONS,
  type ReportReason,
  type ReportTargetKind,
} from "../lib/reports";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

const REASON_LABELS: Record<ReportReason, string> = {
  inappropriate_behavior: "Inappropriate behaviour",
  spam: "Spam",
  harassment: "Harassment",
  fake_profile: "Fake profile",
  safety_concern: "Safety concern",
  other: "Other",
};

/**
 * Files a report against either a venue or a member. Exactly one of
 * `venueSlug`/`reportedUserId` should be passed by the caller — mirrors the
 * `reports_has_subject` CHECK constraint in 0007_moderation.sql.
 *
 * `targetKind`/`targetId` are optional and narrow the report to one piece of
 * content (a chat message, a review). When they are given, the admin queue
 * shows that content inline instead of making a moderator hunt for it.
 *
 * `compact` renders the trigger as a small inline link, for putting one on
 * every message in a list without the row turning into a wall of buttons.
 */
export function ReportDialog({
  venueSlug,
  reportedUserId,
  targetKind,
  targetId,
  triggerLabel = "Report",
  compact = false,
}: {
  venueSlug?: string;
  reportedUserId?: string;
  targetKind?: ReportTargetKind;
  targetId?: string;
  triggerLabel?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>(REPORT_REASONS[0]);
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);

    try {
      const result = await fileReport({
        data: {
          reason,
          description: description.trim() || undefined,
          venueSlug,
          reportedUserId,
          targetKind,
          targetId,
        },
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Report filed. Thanks for flagging it.");
      setDescription("");
      setReason(REPORT_REASONS[0]);
      setOpen(false);
    } catch {
      toast.error("Could not reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {compact ? (
          <button
            type="button"
            className="text-[11px] font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-destructive hover:underline"
          >
            {triggerLabel}
          </button>
        ) : (
          <Button variant="ghost" size="sm">
            {triggerLabel}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>File a report</DialogTitle>
            <DialogDescription>
              Seen by admins only. Filing a report never notifies the person or
              venue you are reporting.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1">
            <Label htmlFor="report-reason">Reason</Label>
            <select
              id="report-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as ReportReason)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              {REPORT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="report-description">Details (optional)</Label>
            <Textarea
              id="report-description"
              value={description}
              maxLength={4000}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened?"
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Filing…" : "Submit report"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
