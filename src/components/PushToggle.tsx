import { Bell, BellOff } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  VAPID_PUBLIC_KEY,
  pushConfigured,
  removePushSubscription,
  savePushSubscription,
  urlBase64ToUint8Array,
} from "../lib/push";
import { pillClass, primaryPillClass } from "./PageChrome";

/**
 * Turns Web Push on or off for this device.
 *
 * Per device, not per account, which the copy says out loud — people are
 * surprised when enabling notifications on a laptop does nothing on their
 * phone.
 *
 * Renders nothing at all when push is not configured or the browser has no
 * support, rather than offering a button that cannot work. Safari on iOS in
 * particular only exposes PushManager once the app is installed to the home
 * screen, so "not supported" here is a real and common state.
 */
export function PushToggle() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (
      !pushConfigured() ||
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      return;
    }
    setSupported(true);
    setDenied(Notification.permission === "denied");

    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((existing) => setSubscribed(Boolean(existing)))
      .catch(() => {
        /* no registration yet — that is the unsubscribed state */
      });
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setDenied(permission === "denied");
        toast.error("Notifications are blocked in your browser settings.");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        // Required by every browser: a push that does not show a notification
        // is not allowed, and userVisibleOnly is how you promise that.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const json = subscription.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
        toast.error("Your browser returned an incomplete subscription.");
        return;
      }

      const result = await savePushSubscription({
        data: {
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          userAgent: navigator.userAgent.slice(0, 400),
        },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSubscribed(true);
      toast.success("Notifications on for this device.");
    } catch {
      toast.error("Could not turn notifications on.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        // Tell the server first: if unsubscribing locally succeeds and the
        // server row survives, we would keep pushing to a dead endpoint.
        await removePushSubscription({
          data: { endpoint: subscription.endpoint },
        });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      toast.success("Notifications off for this device.");
    } catch {
      toast.error("Could not turn notifications off.");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  return (
    <div className="flex flex-col gap-2">
      {denied ? (
        <p className="text-sm text-muted-foreground">
          Notifications are blocked for this site. Allow them in your browser's
          site settings, then come back.
        </p>
      ) : subscribed ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void disable()}
          className={pillClass("w-fit gap-1.5")}
        >
          <BellOff className="h-4 w-4" aria-hidden />
          {busy ? "Working…" : "Turn off on this device"}
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void enable()}
          className={primaryPillClass("w-fit gap-1.5")}
        >
          <Bell className="h-4 w-4" aria-hidden />
          {busy ? "Working…" : "Turn on for this device"}
        </button>
      )}
      <p className="text-[11px] text-muted-foreground">
        Notifications are per device — turn them on separately on your phone.
      </p>
    </div>
  );
}
