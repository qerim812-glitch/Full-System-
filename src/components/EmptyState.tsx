import type { ReactNode } from "react";

/** Centred empty / error state card with an abstract illustration. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-card px-6 py-14 text-center shadow-sm">
      <svg
        className="mb-5 h-20 w-20 text-muted-foreground/30"
        viewBox="0 0 80 80"
        fill="none"
        aria-hidden
      >
        <circle
          cx="40"
          cy="40"
          r="36"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray="6 4"
        />
        <circle
          cx="40"
          cy="30"
          r="10"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        <path
          d="M20 62c0-11.046 8.954-20 20-20s20 8.954 20 20"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        {body}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
