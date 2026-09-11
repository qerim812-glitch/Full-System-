import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ReportDialog } from "../../components/ReportDialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  blockUser,
  fetchDmThread,
  markThreadRead,
  sendDirectMessage,
} from "../../lib/messaging";
import { cn } from "../../lib/utils";

/** Matches the venue chat cadence. */
const POLL_MS = 5000;

export const Route = createFileRoute("/_authed/messages_/$userId")({
  loader: async ({ params }) => {
    const thread = await fetchDmThread({ data: { userId: params.userId } });
    // Opening a thread is what marks it read; doing it in the loader means it
    // happens on navigation rather than needing an effect.
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
      // A dropped poll is not worth an interruption; the next tick retries.
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <Link
            to="/messages"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            ← Messages
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {initial.otherName}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ReportDialog reportedUserId={userId} />
          <Button variant="outline" size="sm" onClick={handleBlock}>
            Block
          </Button>
        </div>
      </div>

      <ul
        ref={listRef}
        className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto rounded-lg border border-border bg-card p-4"
        aria-live="polite"
        aria-label={`Conversation with ${initial.otherName}`}
      >
        {messages.length === 0 ? (
          <li className="text-sm text-muted-foreground">
            No messages yet. Send the first one.
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
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
              <time
                dateTime={message.created_at}
                className="mt-0.5 block text-[10px] opacity-70"
              >
                {new Date(message.created_at).toLocaleString()}
              </time>
            </li>
          ))
        )}
      </ul>

      <form onSubmit={handleSend} className="flex gap-2">
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a message…"
          maxLength={2000}
          aria-label="Message"
        />
        <Button type="submit" disabled={sending || !body.trim()}>
          {sending ? "Sending…" : "Send"}
        </Button>
      </form>
    </div>
  );
}
