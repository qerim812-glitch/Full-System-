import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  fetchVenueChat,
  postVenueChat,
  type ChatMessage,
} from "../lib/messaging";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

/** How often to look for new messages while the room is open. */
const POLL_MS = 5000;

/**
 * A venue's chat room.
 *
 * Polls rather than using Supabase Realtime. Realtime would need
 * chat_messages added to the supabase_realtime publication and a websocket
 * the server render cannot exercise; polling needs no extra infrastructure
 * and degrades predictably. Swapping in a subscription later only changes
 * how `setMessages` is fed.
 */
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
      // A failed poll is not worth interrupting the user over; the next tick
      // will try again.
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    let active = true;

    async function tick() {
      if (!active) return;
      await refresh();
    }

    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueSlug]);

  // Keep the newest message in view as the room fills.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;

    setSending(true);
    const result = await postVenueChat({ data: { venueSlug, body: trimmed } });
    setSending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setBody("");
    await refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-foreground">Venue chat</h2>
        <span className="text-xs text-muted-foreground">
          Everyone who booked here
        </span>
      </div>

      <ul
        ref={listRef}
        className="flex max-h-72 flex-col gap-2 overflow-y-auto"
        aria-live="polite"
        aria-label="Chat messages"
      >
        {!loaded ? (
          <li className="text-sm text-muted-foreground">Loading messages…</li>
        ) : messages.length === 0 ? (
          <li className="text-sm text-muted-foreground">
            No messages yet. Say hello.
          </li>
        ) : (
          messages.map((message) => (
            <li
              key={message.id}
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                message.is_mine
                  ? "self-end bg-primary text-primary-foreground"
                  : "self-start bg-muted text-foreground",
              )}
            >
              {!message.is_mine ? (
                <p className="mb-0.5 text-xs font-medium opacity-70">
                  {message.author_name}
                </p>
              ) : null}
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
            </li>
          ))
        )}
      </ul>

      <form onSubmit={handleSend} className="flex gap-2">
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Message the room…"
          maxLength={1000}
          aria-label="Message"
        />
        <Button type="submit" disabled={sending || !body.trim()}>
          {sending ? "Sending…" : "Send"}
        </Button>
      </form>

      <p className="text-xs text-muted-foreground">
        You can post here once you have a booking at this venue.
      </p>
    </section>
  );
}
