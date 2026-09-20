import { useCallback, useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallState =
  /** Already running as an installed app, or not a browser at all. */
  | "installed"
  /** Chrome/Edge/Samsung on Android or desktop: we can trigger the prompt. */
  | "promptable"
  /** iOS Safari: no prompt API; show the Share → Add to Home Screen steps. */
  | "ios-manual"
  /** Nothing to offer (desktop Safari, Firefox, in-app browsers…). */
  | "unsupported";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iP(hone|ad|od)/.test(ua);
  // Chrome/Firefox on iOS are WebKit too but cannot add to home screen.
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return ios && safari;
}

/**
 * Registers the service worker (a requirement for installability on Android)
 * and tracks whether the browser will let us offer "Add to Home Screen".
 */
export function useInstallPrompt() {
  const [state, setState] = useState<InstallState>("unsupported");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );

  useEffect(() => {
    if (isStandalone()) {
      setState("installed");
      return;
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    if (isIosSafari()) setState("ios-manual");

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setState("promptable");
    };
    const onInstalled = () => {
      setDeferred(null);
      setState("installed");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === "accepted") setState("installed");
    return outcome === "accepted";
  }, [deferred]);

  return { state, install };
}
