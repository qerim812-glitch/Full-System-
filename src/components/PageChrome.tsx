import { Link } from "@tanstack/react-router";
import { ArrowLeft, Search } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../lib/utils";

/** Title + subtitle block used at the top of every authed page. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle ? (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}

/** Route-level error fallback; replaces five copy-pasted variants. */
export function RouteError({
  title,
  body = "Refresh the page to try again.",
  backTo,
  backLabel,
}: {
  title: string;
  body?: string;
  backTo?: "/venues" | "/bookings" | "/messages" | "/people";
  backLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{body}</p>
      {backTo ? (
        <Link to={backTo} className={pillClass("mt-5")}>
          {backLabel ?? "Go back"}
        </Link>
      ) : null}
    </div>
  );
}

/** Pill-shaped back link ("← All venues"). */
export function BackLink({
  to,
  children,
}: {
  to: "/venues" | "/messages" | "/people" | "/bookings";
  children: ReactNode;
}) {
  return (
    <Link to={to} className={pillClass("flex w-fit items-center gap-1.5")}>
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {children}
    </Link>
  );
}

/** Rounded search field with a leading icon; full width on phones. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  className,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  label: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className={cn("relative w-full sm:w-64", className)}>
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        autoFocus={autoFocus}
        className="h-10 w-full rounded-full border border-border bg-card pl-9 pr-4 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

/** Class string for secondary pill buttons/links. */
export function pillClass(extra?: string, opts: { danger?: boolean } = {}) {
  return cn(
    "inline-flex min-h-9 items-center justify-center rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground shadow-sm transition-all disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    opts.danger
      ? "hover:border-destructive/40 hover:text-destructive"
      : "hover:border-foreground/20 hover:text-foreground",
    extra,
  );
}

/** Class string for the primary (dark) pill button. */
export function primaryPillClass(extra?: string) {
  return cn(
    "inline-flex min-h-9 items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    extra,
  );
}

/** Toggle chip (filters, slot pickers). Carries aria-pressed. */
export function Chip({
  active,
  onClick,
  children,
  disabled,
  className,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean | undefined;
  className?: string | undefined;
  title?: string | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={title}
      className={cn(
        "min-h-8 rounded-full px-3 py-1 text-xs font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "bg-primary text-primary-foreground"
          : "border border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}
