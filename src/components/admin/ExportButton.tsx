import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { pillClass } from "../PageChrome";

/**
 * Downloads a CSV produced by a server function.
 *
 * The same twelve lines were about to be copied into five panels, so the
 * object-URL dance lives here once. `URL.revokeObjectURL` matters: without it
 * every export leaks the whole file until the tab is closed, which for a
 * 5000-row bookings export is real memory.
 */
export function ExportButton({
  label,
  filename,
  fetchCsv,
}: {
  label: string;
  /** Without the date or the .csv suffix — both are added here. */
  filename: string;
  fetchCsv: () => Promise<string>;
}) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      const csv = await fetchCsv();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `social-circle-${filename}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(`Could not export ${label.toLowerCase()}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={busy}
      className={pillClass("gap-1.5 text-xs")}
    >
      <Download className="h-3.5 w-3.5" aria-hidden />
      {busy ? "Exporting…" : label}
    </button>
  );
}
