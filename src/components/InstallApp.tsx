import { Download, Share, SquarePlus, X } from "lucide-react";
import { useEffect, useState } from "react";

import { useInstallPrompt } from "../hooks/use-install-prompt";
import { cn } from "../lib/utils";
import { pillClass, primaryPillClass } from "./PageChrome";

const DISMISS_KEY = "install-banner-dismissed";

/**
 * "Install the app" — as a card (Account page) or a slim banner (top of the
 * signed-in shell on phones, dismissable for 30 days).
 *
 * Android and desktop Chromium fire `beforeinstallprompt`, so one tap opens
 * the real install sheet. iOS has no API for it, so Safari users get the two
 * steps spelled out instead. Nothing shows once the app is installed.
 */
export function InstallApp({
  variant = "card",
  className,
}: {
  variant?: "card" | "banner";
  className?: string;
}) {
  const { state, install } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (variant !== "banner") {
      setDismissed(false);
      return;
    }
    try {
      const until = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      setDismissed(until > Date.now());
    } catch {
      setDismissed(false);
    }
  }, [variant]);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(
        DISMISS_KEY,
        String(Date.now() + 30 * 24 * 3_600_000),
      );
    } catch {
      // Storage unavailable — the banner just comes back next visit.
    }
  }

  if (state === "installed" || state === "unsupported" || dismissed) {
    return null;
  }

  const steps =
    state === "ios-manual" ? (
      <ol className="flex flex-col gap-1 text-sm text-muted-foreground">
        <li className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
            1
          </span>
          Tap <Share className="h-4 w-4" aria-hidden />
          <span className="font-medium text-foreground">Share</span> in Safari
        </li>
        <li className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
            2
          </span>
          Choose <SquarePlus className="h-4 w-4" aria-hidden />
          <span className="font-medium text-foreground">
            Add to Home Screen
          </span>
        </li>
      </ol>
    ) : null;

  if (variant === "banner") {
    return (
      <div
        role="region"
        aria-label="Install the app"
        className={cn(
          "flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm",
          className,
        )}
      >
        <img
          src="/icons/icon-192.png"
          alt=""
          className="h-10 w-10 shrink-0 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            Get the Social Circle app
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {state === "ios-manual"
              ? "Share → Add to Home Screen"
              : "One tap, no app store."}
          </p>
        </div>
        {state === "promptable" ? (
          <button
            type="button"
            onClick={() => void install()}
            className={primaryPillClass("h-9 px-4 text-xs")}
          >
            Install
          </button>
        ) : null}
        <button
          type="button"
          onClick={dismiss}
          className="rounded-full p-1.5 text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <img
          src="/icons/icon-192.png"
          alt=""
          className="h-12 w-12 shrink-0 rounded-2xl"
        />
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">
            Install the app
          </h2>
          <p className="text-sm text-muted-foreground">
            Social Circle works as an app on your phone: its own icon, full
            screen, and push notifications for messages and meetups. No app
            store needed.
          </p>
        </div>
      </div>
      {steps}
      {state === "promptable" ? (
        <button
          type="button"
          onClick={() => void install()}
          className={primaryPillClass("w-fit gap-1.5")}
        >
          <Download className="h-4 w-4" aria-hidden />
          Install Social Circle
        </button>
      ) : null}
      {state === "ios-manual" ? (
        <p className={pillClass("w-fit pointer-events-none text-xs")}>
          Works in Safari on iPhone and iPad
        </p>
      ) : null}
    </section>
  );
}
