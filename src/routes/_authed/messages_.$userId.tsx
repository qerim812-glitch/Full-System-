import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ReportDialog } from "../../components/ReportDialog";
import {
  blockUser,
  fetchDmThread,
  markThreadRead,
  sendDirectMessage,
} from "../../lib/messaging";
import { cn } from "../../lib/utils";

const POLL_MS = 5000;

export const Route = createFileRoute("/_authed/messages_/$userId")({
  loader: async ({ params }) => {
    const thread = await fetchDmThread({ data: { userId: params.userId } });
    await markThreadRead({ data: { userId: params.userId } });
    return thread;
  },
  component: ThreadPage,
});

function ThreadPage() {
  const initial = Route.useLoaderData();
  const { userId } = Route.useParams();
  const router = useRouter();

  const [messages, setMessages] = useState(initial.messages);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  async function refresh() {
    try {
      const next = await fetchDmThread({ data: { userId } });
      setMessages(next.messages);
    } catch {
      // Dropped poll — next tick retries silently.
    }
  }

  useEffect(() => {
    let active = true;
    const timer = setInterval(() => {
      if (active) void refresh();
    }, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setSending(true);
    const result = await sendDirectMessage({
      data: { recipientId: userId, body: trimmed },
    });
    setSending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setBody("");
    await refresh();
  }

  async function handleBlock() {
    const result = await blockUser({ data: { userId } });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${initial.otherName} is blocked.`);
    await router.navigate({ to: "/messages" });
  }

  return (
    <div className="flex flex-col gap-6">

      {/* ── Top bar ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Link
            to="/messages"
            className="flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground shadow-sm transition-all hover:border-foreground/20 hover:text-foreground"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Messages
          </Link>

          {/* Avatar + name */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
              {((initial.otherName ?? "M")[0] ?? "M").toUpperCase()}
            </div>
            <h1 className="text-lg font-semibold text-foreground">
              {initial.otherName}
            </h1>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <ReportDialog reportedUserId={userId} />
          <button
            onClick={handleBlock}
            className="rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-all hover:border-destructive/40 hover:text-destructive"
          >
            Block
          </button>
        </div>
      </div>

      {/* ── Message list ─────────────────────────────────────────── */}
      <ul
        ref={listRef}
        className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto rounded-2xl border border-border bg-card p-5"
        aria-live="polite"
        aria-label={`Conversation with ${initial.otherName}`}
      >
        {messages.length === 0 ? (
          <li className="py-8 text-center text-sm text-muted-foreground">
            No messages yet. Send the first one below.
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
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
              <time
                dateTime={message.created_at}
                className="mt-1 block text-[10px] opacity-60"
              >
                {new Date(message.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </li>
          ))
        )}
      </ul>

      {/* ── Compose bar ──────────────────────────────────────────── */}
      <form onSubmit={handleSend} className="flex gap-3">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a message…"
          maxLength={2000}
          aria-label="Message"
          className="flex-1 rounded-full border border-border bg-card px-5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={sending || !body.trim()}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {sending ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
