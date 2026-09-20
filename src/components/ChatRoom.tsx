import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useRealtime } from "../hooks/use-realtime";
import type { ChatMessage } from "../lib/messaging";
import type { ReportTargetKind } from "../lib/reports";
import { cn, formatTime } from "../lib/utils";
import { primaryPillClass } from "./PageChrome";
import { ReportDialog } from "./ReportDialog";

/**
 * A chat room: message list, composer, realtime refresh.
 *
 * Shared by venue chat and meetup chat, which differ only in where the
 * messages come from and what the report on a message points at. The list
 * refreshes on a Postgres change (or the poll fallback) rather than
 * appending locally, so everyone sees the same order.
 */
export function ChatRoom({
  title,
  subtitle,
  footer,
  fetchMessages,
  sendMessage,
  realtime,
  report,
  disabled = false,
  disabledReason,
}: {
  title: string;
  subtitle?: string;
  footer?: ReactNode;
  fetchMessages: () => Promise<ChatMessage[]>;
  sendMessage: (
    body: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  realtime: { table: string; filter: string };
  report: { targetKind: ReportTargetKind; venueSlug?: string | undefined };
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  async function refresh() {
    try {
      setMessages(await fetchMessages());
    } catch {
      // silent — next tick retries
    } finally {
      setLoaded(true);
    }
  }

  useRealtime({
    table: realtime.table,
    filter: realtime.filter,
    onChange: () => void refresh(),
  });

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realtime.filter]);

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
      const result = await sendMessage(trimmed);
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
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {subtitle ? (
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        ) : null}
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
              <div className="mt-1 flex items-center gap-2">
                <time
                  dateTime={message.created_at}
                  className="block text-[11px] opacity-60"
                >
                  {formatTime(message.created_at)}
                </time>
                {!message.is_mine ? (
                  <ReportDialog
                    compact
                    {...(report.venueSlug
                      ? { venueSlug: report.venueSlug }
                      : {})}
                    reportedUserId={message.user_id}
                    targetKind={report.targetKind}
                    targetId={message.id}
                  />
                ) : null}
              </div>
            </li>
          ))
        )}
      </ul>
      <p className="sr-only" aria-live="polite">
        {last && !last.is_mine ? `${last.author_name}: ${last.body}` : ""}
      </p>

      {disabled ? (
        <p className="text-xs text-muted-foreground">{disabledReason}</p>
      ) : (
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
      )}

      {footer ? (
        <p className="text-xs text-muted-foreground">{footer}</p>
      ) : null}
    </section>
  );
}
