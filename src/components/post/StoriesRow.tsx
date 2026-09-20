import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { StoryGroup } from "../../lib/posts";
import { cn, formatRelative } from "../../lib/utils";
import { Avatar } from "../Avatar";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";

/**
 * The row of story rings at the top of the feed, and the full-screen viewer
 * that opens from it. Your own ring is first and doubles as the "add a story"
 * button when you have none up.
 */
export function StoriesRow({ groups }: { groups: StoryGroup[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const mine = groups.find((g) => g.is_mine);

  return (
    <>
      <ul className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
        {!mine ? (
          <li className="shrink-0">
            <Link
              to="/new"
              search={{ story: true }}
              className="flex w-[4.5rem] flex-col items-center gap-1.5 text-center"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-border bg-card text-muted-foreground">
                <Plus className="h-6 w-6" aria-hidden />
              </span>
              <span className="w-full truncate text-[11px] text-muted-foreground">
                Your story
              </span>
            </Link>
          </li>
        ) : null}
        {groups.map((group, index) => {
          const name = group.is_mine
            ? "You"
            : group.author.display_name?.trim() || "Member";
          return (
            <li key={group.user_id} className="shrink-0">
              <button
                type="button"
                onClick={() => setOpen(index)}
                className="flex w-[4.5rem] flex-col items-center gap-1.5 text-center"
              >
                <span className="rounded-full bg-gradient-to-tr from-accent via-destructive to-brand p-[3px]">
                  <span className="block rounded-full bg-background p-[2px]">
                    <Avatar
                      name={name}
                      url={group.author.avatar_url}
                      size="lg"
                      className="h-14 w-14 text-xl"
                      tone="muted"
                    />
                  </span>
                </span>
                <span className="w-full truncate text-[11px] text-foreground">
                  {name}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {open !== null && groups[open] ? (
        <StoryViewer
          groups={groups}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

function StoryViewer({
  groups,
  index,
  onIndex,
  onClose,
}: {
  groups: StoryGroup[];
  index: number;
  onIndex: (next: number) => void;
  onClose: () => void;
}) {
  const group = groups[index]!;
  const [item, setItem] = useState(0);

  // A new author starts from their first story.
  useEffect(() => setItem(0), [index]);

  const current = group.items[item] ?? group.items[0]!;
  const name = group.is_mine
    ? "You"
    : group.author.display_name?.trim() || "Member";

  function next() {
    if (item + 1 < group.items.length) setItem(item + 1);
    else if (index + 1 < groups.length) onIndex(index + 1);
    else onClose();
  }
  function prev() {
    if (item > 0) setItem(item - 1);
    else if (index > 0) onIndex(index - 1);
  }

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent
        className="h-dvh max-h-dvh w-screen max-w-none overflow-hidden border-0 bg-black p-0 text-white sm:h-[85dvh] sm:max-h-[85dvh] sm:w-auto sm:max-w-md sm:rounded-2xl [&>button]:hidden"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Story by {name}</DialogTitle>

        <div className="absolute inset-x-0 top-0 z-10 flex flex-col gap-2 bg-gradient-to-b from-black/70 to-transparent p-3">
          <div className="flex gap-1">
            {group.items.map((s, i) => (
              <span
                key={s.id}
                className={cn(
                  "h-0.5 flex-1 rounded-full",
                  i <= item ? "bg-white" : "bg-white/30",
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Avatar
              name={name}
              url={group.author.avatar_url}
              size="sm"
              tone="muted"
            />
            <span className="text-sm font-semibold">{name}</span>
            <time
              dateTime={current.created_at}
              className="text-xs text-white/70"
            >
              {formatRelative(current.created_at)}
            </time>
            <button
              type="button"
              onClick={onClose}
              className="ml-auto rounded-full p-1.5 hover:bg-white/10"
              aria-label="Close"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>

        <img
          src={current.photo_url}
          alt={current.body ?? `Story by ${name}`}
          className="h-full w-full object-contain"
        />

        {/* Tap zones: left third back, the rest forward — Instagram's rule. */}
        <button
          type="button"
          onClick={prev}
          className="absolute inset-y-0 left-0 w-1/3"
          aria-label="Previous"
        >
          <ChevronLeft className="sr-only" />
        </button>
        <button
          type="button"
          onClick={next}
          className="absolute inset-y-0 right-0 w-2/3"
          aria-label="Next"
        >
          <ChevronRight className="sr-only" />
        </button>

        {current.body || current.venue_name ? (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {current.venue_name ? (
              <p className="text-xs font-semibold text-white/80">
                {current.venue_name}
              </p>
            ) : null}
            {current.body ? (
              <p className="text-sm text-white">{current.body}</p>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
