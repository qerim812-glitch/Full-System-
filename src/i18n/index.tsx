import { createServerFn } from "@tanstack/react-start";
import { getCookies } from "@tanstack/react-start/server";
import { createContext, useContext, type ReactNode } from "react";

import en from "./en.json";
import sq from "./sq.json";

/**
 * Localisation.
 *
 * Deliberately not i18next. The blocker is server rendering: i18next keeps the
 * active language on a single module-level instance, and this app renders on
 * the server, where two requests for two different members are in flight at
 * once. One mutable global language is then a race — request A sets `sq`,
 * request B sets `en`, and A renders in the wrong language. Working around
 * that means a fresh instance per request and threading it through anyway,
 * which is most of what is written below, with a dependency on top.
 *
 * So the locale lives in React context instead: passed in explicitly, never
 * mutated, impossible to leak between requests. What is lost is i18next's
 * plural rules and lazy namespace loading; both catalogs together are a few
 * kilobytes, and Albanian pluralises like English (one / other), so neither is
 * missed yet. If that changes, `t()` is the only thing to swap.
 */

export const LOCALES = ["sq", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** Albanian is the default — this is a Tirana product. */
export const DEFAULT_LOCALE: Locale = "sq";

export const LOCALE_COOKIE = "locale";

const CATALOGS: Record<Locale, Record<string, string>> = { en, sq };

export function isLocale(value: string | undefined | null): value is Locale {
  return (LOCALES as readonly string[]).includes(value ?? "");
}

export function localeName(locale: Locale): string {
  return CATALOGS[locale]["lang.name"] ?? locale;
}

/**
 * Looks up a key and fills in `{{placeholders}}`.
 *
 * Falls back to English, then to the key itself. Returning the key rather than
 * an empty string is deliberate: a missing translation shows up as
 * `meetups.join` in the UI, which is obvious in review, where blank text is
 * not.
 */
export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const text = CATALOGS[locale][key] ?? CATALOGS.en[key] ?? key;
  if (!vars) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** `const t = useT(); t("meetups.join")` */
export function useT() {
  const locale = useLocale();
  return (key: string, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);
}

/**
 * The locale for this request, from the cookie.
 *
 * Read on the server so the markup it renders already matches what the browser
 * will render — the same reason the date helpers pin their time zone. Choosing
 * the language on the client after hydration would flash English and warn
 * about a hydration mismatch.
 */
export const getLocale = createServerFn({ method: "GET" }).handler(
  async (): Promise<Locale> => {
    try {
      const value = getCookies()[LOCALE_COOKIE];
      return isLocale(value) ? value : DEFAULT_LOCALE;
    } catch {
      return DEFAULT_LOCALE;
    }
  },
);

/**
 * Persists the choice from the browser.
 *
 * A plain document.cookie rather than a server round trip: the locale is not a
 * secret, so it does not need httpOnly, and writing it directly means the
 * caller can immediately invalidate the router and have the server re-render
 * in the new language.
 */
export function setLocaleCookie(locale: Locale): void {
  if (typeof document === "undefined") return;
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${oneYear}; samesite=lax`;
}
