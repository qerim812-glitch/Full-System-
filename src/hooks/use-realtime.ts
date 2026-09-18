import { useEffect, useRef } from "react";

import { getRealtimeToken } from "../lib/auth";
import { getSupabaseBrowserClient } from "../lib/supabase/browser";

/**
 * Subscribe to Postgres changes on a table, with polling as the safety net.
 *
 * Realtime has to be enabled per table in Supabase (Database → Replication →
 * `supabase_realtime`). If it is not, or the websocket cannot connect, the
 * subscription silently delivers nothing — so this keeps a slow interval as a
 * fallback and speeds it up only once the channel is actually SUBSCRIBED. The
 * result is that turning Realtime on makes the app faster, and forgetting to
 * turn it on leaves it exactly as it was rather than breaking it.
 *
 * The websocket cannot read the httpOnly session cookie, so it is authenticated
 * with a short-lived access token from `getRealtimeToken()`. Without that the
 * socket is anonymous and RLS filters out every private row.
 */
export function useRealtime(options: {
  /** Postgres table to watch. */
  table: string;
  /** PostgREST filter, e.g. `venue_slug=eq.mulliri`. */
  filter?: string;
  /** Called on every insert/update/delete, and on each fallback tick. */
  onChange: () => void;
  /** Fallback interval while realtime is not connected. */
  fallbackMs?: number;
  /** Interval kept once realtime IS connected, as a belt-and-braces resync. */
  connectedMs?: number;
  enabled?: boolean;
}) {
  const {
    table,
    filter,
    onChange,
    fallbackMs = 5_000,
    connectedMs = 60_000,
    enabled = true,
  } = options;

  // Held in a ref so a new inline callback on every render does not tear down
  // and rebuild the websocket subscription.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let channel: ReturnType<
      ReturnType<typeof getSupabaseBrowserClient>["channel"]
    > | null = null;

    const fire = () => {
      if (!cancelled && document.visibilityState === "visible") {
        onChangeRef.current();
      }
    };

    const startPolling = (ms: number) => {
      if (timer) clearInterval(timer);
      timer = setInterval(fire, ms);
    };

    // Start pessimistic: poll at the fallback rate until the socket says it is
    // subscribed.
    startPolling(fallbackMs);

    void (async () => {
      try {
        const auth = await getRealtimeToken();
        if (cancelled || !auth) return;

        const supabase = getSupabaseBrowserClient();
        supabase.realtime.setAuth(auth.token);

        channel = supabase
          .channel(`rt:${table}:${filter ?? "all"}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table,
              ...(filter ? { filter } : {}),
            },
            () => fire(),
          )
          .subscribe((status: string) => {
            if (cancelled) return;
            // Only now is it safe to back off. CHANNEL_ERROR and TIMED_OUT
            // mean we are not receiving anything, so stay on the fast poll.
            if (status === "SUBSCRIBED") startPolling(connectedMs);
            else startPolling(fallbackMs);
          });
      } catch {
        // Polling is already running; realtime is an optimisation, not a
        // dependency, so a failure here is not worth surfacing.
      }
    })();

    const onVisible = () => fire();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) void getSupabaseBrowserClient().removeChannel(channel);
    };
  }, [table, filter, fallbackMs, connectedMs, enabled]);
}
