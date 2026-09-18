import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

import {
  LOCALES,
  localeName,
  setLocaleCookie,
  useLocale,
  type Locale,
} from "../i18n";
import { cn } from "../lib/utils";

/**
 * Switches language.
 *
 * Writes the cookie and then invalidates the router so the server re-renders
 * in the new language — rather than swapping strings client-side, which would
 * leave the server-rendered markup and `<html lang>` disagreeing with what is
 * on screen.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function choose(next: Locale) {
    if (next === locale || busy) return;
    setBusy(true);
    setLocaleCookie(next);
    try {
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="group"
      aria-label={localeName(locale)}
      className={cn(
        "flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5",
        className,
      )}
    >
      {LOCALES.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => void choose(option)}
          aria-pressed={locale === option}
          disabled={busy}
          className={cn(
            "rounded-full px-2 py-1 text-[11px] font-semibold uppercase transition-colors",
            locale === option
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
