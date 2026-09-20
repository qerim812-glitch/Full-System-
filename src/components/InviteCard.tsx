import { Copy, Gift, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { Referral } from "../lib/referrals";
import { pillClass, primaryPillClass } from "./PageChrome";

/** The member's invite link, with copy and the native share sheet. */
export function InviteCard({ referral }: { referral: Referral }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(referral.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy. Long-press the link instead.");
    }
  }

  async function share() {
    const data = {
      title: "Join me on Social Circle",
      text: "Meet people and go out in Tirana — join with my link:",
      url: referral.url,
    };
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(data);
      } catch {
        // Cancelled — nothing to report.
      }
    } else {
      await copy();
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Gift className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">
            Bring a friend
          </h2>
          <p className="text-sm text-muted-foreground">
            Anyone who signs up with your link lands in your circle, and you
            hear about it the moment they join.
            {referral.joined > 0
              ? ` ${referral.joined} ${referral.joined === 1 ? "person has" : "people have"} joined so far.`
              : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-full border border-border bg-background px-4 py-2 text-xs text-foreground">
          {referral.url}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          className={pillClass("gap-1.5 text-xs")}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={() => void share()}
          className={primaryPillClass("gap-1.5 text-xs")}
        >
          <Share2 className="h-3.5 w-3.5" aria-hidden />
          Share
        </button>
      </div>
    </section>
  );
}
