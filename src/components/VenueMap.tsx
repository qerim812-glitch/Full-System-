import { useEffect, useRef, useState } from "react";

import { EmptyState } from "./EmptyState";

export type MapPin = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Optional second line in the popup, e.g. the branch name or address. */
  detail?: string | null;
  /** Where clicking the popup title should go. */
  href?: string | null;
};

/** Centre of Tirana, used when nothing is plotted yet. */
const TIRANA: [number, number] = [19.8187, 41.3275];

/**
 * A MapLibre map of venues or branches.
 *
 * Tiles come from OpenFreeMap, which needs no account and no API key — the
 * alternative, MapTiler, is better looking but would put a key in the client
 * bundle and a billing relationship behind a feature nobody has asked to pay
 * for yet. Swapping the style URL is the only change if that day comes.
 *
 * MapLibre and its CSS are imported dynamically: the library is roughly a
 * quarter of a megabyte, and most visits never open the map. Loading it on
 * demand keeps it off the critical path for everyone else.
 *
 * Venues with no coordinates are simply absent — `lat`/`lng` are nullable, and
 * the constraint in 0021 guarantees they are both set or both null, so there is
 * never a pin at an undefined longitude.
 */
export function VenueMap({
  pins,
  className,
}: {
  pins: MapPin[];
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (pins.length === 0) return;
    const container = containerRef.current;
    if (!container) return;

    let map: { remove: () => void } | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const [maplibre] = await Promise.all([
          import("maplibre-gl"),
          // Side-effect import; the map renders unstyled without it.
          import("maplibre-gl/dist/maplibre-gl.css"),
        ]);
        if (cancelled) return;

        const instance = new maplibre.Map({
          container,
          style: "https://tiles.openfreemap.org/styles/liberty",
          center: TIRANA,
          zoom: 12,
          // Tirana is small; without this people zoom out to the Atlantic.
          minZoom: 9,
          attributionControl: { compact: true },
        });
        map = instance;

        instance.addControl(new maplibre.NavigationControl(), "top-right");

        const bounds = new maplibre.LngLatBounds();
        for (const pin of pins) {
          const popupHtml = `<strong>${escapeHtml(pin.name)}</strong>${
            pin.detail ? `<br/><span>${escapeHtml(pin.detail)}</span>` : ""
          }`;
          new maplibre.Marker({ color: "#232633" })
            .setLngLat([pin.lng, pin.lat])
            .setPopup(new maplibre.Popup({ offset: 24 }).setHTML(popupHtml))
            .addTo(instance);
          bounds.extend([pin.lng, pin.lat]);
        }

        // Fit to what is actually plotted. A single pin has zero-area bounds,
        // which fitBounds turns into maximum zoom — so centre on it instead.
        if (pins.length === 1 && pins[0]) {
          instance.setCenter([pins[0].lng, pins[0].lat]);
          instance.setZoom(15);
        } else {
          instance.fitBounds(bounds, { padding: 48, maxZoom: 15 });
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [pins]);

  if (pins.length === 0) {
    return (
      <EmptyState
        title="No locations on the map yet"
        body="Venues appear here once their coordinates are filled in from the admin panel."
      />
    );
  }

  if (failed) {
    return (
      <EmptyState
        title="Map could not load"
        body="Check your connection and refresh. The list view has the same venues."
      />
    );
  }

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Map of venues"
      className={
        className ??
        "h-[60dvh] min-h-80 w-full overflow-hidden rounded-2xl border border-border"
      }
    />
  );
}

/** Popups take raw HTML, so anything interpolated into one must be escaped. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
