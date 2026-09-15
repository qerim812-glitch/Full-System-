import { useCallback, useEffect, useState } from "react";

export const THEME_STORAGE_KEY = "theme";

/**
 * Inline script for <head>. Runs before hydration so a dark-mode user never
 * sees a light flash: it applies the saved (or OS) preference to <html>
 * synchronously, and `useTheme` below just reads the result.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

/** Reads / writes the "dark" class on <html> and persists the choice. */
export function useTheme() {
  const [dark, setDarkState] = useState<boolean>(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });

  // The init script may have run after React's initial state snapshot on a
  // hard reload; re-sync once mounted.
  useEffect(() => {
    setDarkState(document.documentElement.classList.contains("dark"));
  }, []);

  const setDark = useCallback((next: boolean) => {
    setDarkState(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // Storage unavailable (private mode) — the class still applies.
    }
  }, []);

  return [dark, setDark] as const;
}
