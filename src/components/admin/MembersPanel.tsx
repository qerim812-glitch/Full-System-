import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  ADMIN_PAGE_SIZE,
  exportMembersCsv,
  fetchMembers,
  type AdminMember,
  type AdminPage,
} from "../../lib/admin";
import { formatDate } from "../../lib/utils";
import { Avatar } from "../Avatar";
import { ConfirmButton } from "../ConfirmButton";
import { Chip, SearchInput, pillClass, primaryPillClass } from "../PageChrome";
import { EmptyCard } from "./EmptyCard";
import { ExportButton } from "./ExportButton";
import { MemberDetailDialog } from "./MemberDetailDialog";

type Filter = "all" | "active" | "suspended";

/**
 * The member list, searched and filtered in the database rather than in the
 * browser.
 *
 * The previous version filtered the 50 rows it happened to have loaded, so
 * searching for a member on page 3 found nothing. `fetchMembers` now takes the
 * term and the suspended flag and returns a total, which is also what makes
 * the page count honest.
 */
export function MembersPanel({
  initial,
  busyId,
  suspend,
  onChanged,
}: {
  initial: AdminPage<AdminMember>;
  busyId: string | null;
  suspend: (userId: string, suspended: boolean) => Promise<void>;
  onChanged: () => void | Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<AdminMember | null>(null);

  useEffect(() => {
    setResult(initial);
  }, [initial]);

  // Debounced: typing a name would otherwise fire a query per keystroke.
  useEffect(() => {
    const term = search.trim();
    const isDefaultView = term === "" && filter === "all" && page === 0;
    if (isDefaultView) {
      setResult(initial);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      fetchMembers({
        data: {
          page,
          ...(term ? { search: term } : {}),
          ...(filter === "all" ? {} : { suspended: filter === "suspended" }),
        },
      })
        .then((rows) => {
          if (!cancelled) setResult(rows);
        })
        .catch(() => {
          if (!cancelled) toast.error("Could not search members.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, filter, page, initial]);

  const pageCount = Math.max(1, Math.ceil(result.total / ADMIN_PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(0);
          }}
          placeholder="Search name or email…"
          label="Search members"
        />
        <div className="flex gap-2" role="group" aria-label="Member status">
          {(["all", "active", "suspended"] as const).map((option) => (
            <Chip
              key={option}
              active={filter === option}
              onClick={() => {
                setFilter(option);
                setPage(0);
              }}
              className="px-3 py-1 text-xs capitalize"
            >
              {option}
            </Chip>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {loading ? "Searching…" : `${result.total} members`}
        </span>
        <ExportButton
          label="Export CSV"
          filename="members"
          fetchCsv={exportMembersCsv}
        />
      </div>

      {result.rows.length === 0 ? (
        <EmptyCard text="No members match that search." />
      ) : (
        <ul className="flex flex-col gap-2">
          {result.rows.map((member) => (
            <li
              key={member.id}
              className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm"
            >
              <button
                type="button"
                onClick={() => setSelected(member)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <Avatar
                  name={member.display_name ?? member.email}
                  size="sm"
                  tone="muted"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground hover:underline">
                    {member.display_name ?? "(no name)"}
                    {member.is_suspended ? (
                      <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                        Suspended
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.email} · Joined {formatDate(member.created_at)}
                  </p>
                </div>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(member)}
                  className={pillClass("text-xs")}
                >
                  View
                </button>
                {member.is_suspended ? (
                  <button
                    type="button"
                    disabled={busyId === member.id}
                    onClick={() => void suspend(member.id, false)}
                    className={primaryPillClass("text-xs")}
                  >
                    Reinstate
                  </button>
                ) : (
                  <ConfirmButton
                    title={`Suspend ${member.display_name ?? member.email ?? "this member"}?`}
                    description="They can no longer book, post or appear in search until reinstated."
                    confirmLabel="Suspend"
                    onConfirm={() => suspend(member.id, true)}
                    disabled={busyId === member.id}
                    className={pillClass("text-xs", { danger: true })}
                  >
                    Suspend
                  </ConfirmButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 ? (
        <nav
          className="flex items-center justify-center gap-3"
          aria-label="Member pages"
        >
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className={pillClass("text-xs")}
          >
            Previous
          </button>
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1 || loading}
            className={pillClass("text-xs")}
          >
            Next
          </button>
        </nav>
      ) : null}

      <MemberDetailDialog
        member={selected}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        onChanged={onChanged}
      />
    </div>
  );
}
