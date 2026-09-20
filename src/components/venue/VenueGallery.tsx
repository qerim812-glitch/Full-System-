import { useState } from "react";

import type { VenuePhoto } from "../../lib/owner";
import { cn } from "../../lib/utils";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";

/**
 * The venue's photo strip. The cover image (venues.image_url) stays the
 * hero; this is everything else, as a scrollable row that opens a lightbox.
 */
export function VenueGallery({
  photos,
  venueName,
}: {
  photos: VenuePhoto[];
  venueName: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (photos.length === 0) return null;
  const current = open === null ? null : photos[open];

  return (
    <>
      <ul
        className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6"
        aria-label={`${venueName} photos`}
      >
        {photos.map((photo, index) => (
          <li key={photo.id} className="shrink-0">
            <button
              type="button"
              onClick={() => setOpen(index)}
              className="block overflow-hidden rounded-xl bg-muted"
            >
              <img
                src={photo.url}
                alt={photo.caption ?? `${venueName} photo ${index + 1}`}
                loading="lazy"
                className="h-28 w-40 object-cover transition-transform hover:scale-105 sm:h-32 sm:w-48"
              />
            </button>
          </li>
        ))}
      </ul>

      {current ? (
        <Dialog open onOpenChange={(o) => (o ? null : setOpen(null))}>
          <DialogContent
            className="max-w-3xl border-0 bg-black p-0 text-white"
            aria-describedby={undefined}
          >
            <DialogTitle className="sr-only">
              {current.caption ?? `${venueName} photo`}
            </DialogTitle>
            <img
              src={current.url}
              alt={current.caption ?? `${venueName} photo`}
              className="max-h-[80dvh] w-full object-contain"
            />
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className={cn(!current.caption && "text-white/60")}>
                {current.caption ?? venueName}
              </span>
              <span className="text-white/60">
                {open! + 1} / {photos.length}
              </span>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
