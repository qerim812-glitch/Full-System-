import type { ReactNode } from "react";

import { Label } from "../ui/label";

/**
 * Pieces shared by the admin panels, extracted when
 * src/routes/_authed/admin.tsx passed 1600 lines with nine panels in it.
 * Behaviour is unchanged — only the file boundaries moved.
 */

/** Runs a mutation, toasts the outcome, and revalidates the route. */
export type Runner = (
  id: string,
  fn: () => Promise<{ ok: boolean; error?: string }>,
  okMsg?: string,
) => Promise<void>;

/** Labelled field used by the venue and branch forms. */
export function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs font-medium">
        {label}
      </Label>
      {children}
    </div>
  );
}
