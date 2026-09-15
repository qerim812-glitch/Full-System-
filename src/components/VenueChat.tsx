import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  fetchVenueChat,
  postVenueChat,
  type ChatMessage,
} from "../lib/messaging";
import { cn, formatTime } from "../lib/utils";
import { primaryPillClass } from "./PageChrome";

const POLL_MS = 5000;

export function VenueChat({ venueSlug }: { venueSlug: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  async function refresh() {
    try {
      const rows = await fetchVenueChat({ data: { venueSlug } });
      setMessages(rows);
    } catch {
      // silent — next tick retries
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    let active = true;
    async function tick() {
      if (active && document.visibilityState === "visible") await refresh();
    }
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    document.addEventListener("visibilitychange", () => void tick());
    return () => {
      active = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueSlug]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      const result = await postVenueChat({
        data: { venueSlug, body: trimmed },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setBody("");
      await refresh();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setSending(false);
    }
  }

  const last = messages[messages.length - 1];

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Venue chat</h2>
        <span className="text-xs text-muted-foreground">
          Everyone who booked here
        </span>
      </div>

      <ul
        ref={listRef}
        className="flex max-h-[50dvh] min-h-40 flex-col gap-2 overflow-y-auto"
        aria-label="Chat messages"
      >
        {!loaded ? (
          <li className="py-4 text-center text-sm text-muted-foreground">
            Loading…
          </li>
        ) : messages.length === 0 ? (
          <li className="py-4 text-center text-sm text-muted-foreground">
            No messages yet. Say hello 👋
          </li>
        ) : (
          messages.map((message) => (
            <li
              key={message.id}
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                message.is_mine
                  ? "self-end bg-primary text-primary-foreground"
                  : "self-start bg-muted text-foreground",
              )}
            >
              {!message.is_mine ? (
                <p className="mb-0.5 text-[11px] font-semibold opacity-70">
                  {message.author_name}
                </p>
              ) : null}
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
              <time
                dateTime={message.created_at}
                className="mt-1 block text-[11px] opacity-60"
              >
                {formatTime(message.created_at)}
              </time>
            </li>
          ))
        )}
      </ul>
      <p className="sr-only" aria-live="polite">
        {last && !last.is_mine ? `${last.author_name}: ${last.body}` : ""}
      </p>

      <form onSubmit={handleSend} className="flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Message the room…"
          maxLength={1000}
          aria-label="Message"
          autoComplete="off"
          className="h-10 flex-1 rounded-full border border-border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={sending || !body.trim()}
          className={primaryPillClass("h-10 px-4")}
        >
          {sending ? "…" : "Send"}
        </button>
      </form>

      <p className="text-xs text-muted-foreground">
        You can post here once you have a confirmed booking at this venue.
      </p>
    </section>
  );
}
