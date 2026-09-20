import { useCallback, useState } from "react";

export type GeoPoint = { lat: number; lng: number };

/**
 * One-shot browser geolocation, requested on demand rather than on load —
 * a permission prompt before anyone asked for "near me" is just noise.
 */
export function useGeolocation() {
  const [point, setPoint] = useState<GeoPoint | null>(null);
  const [status, setStatus] = useState<
    "idle" | "asking" | "ready" | "denied" | "unavailable"
  >("idle");

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    setStatus("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus("ready");
      },
      (err) => {
        setStatus(
          err.code === err.PERMISSION_DENIED ? "denied" : "unavailable",
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }, []);

  return { point, status, request };
}
