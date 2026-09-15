import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Avatar } from "../../components/Avatar";
import { ConfirmButton } from "../../components/ConfirmButton";
import {
  BackLink,
  RouteError,
  pillClass,
  primaryPillClass,
} from "../../components/PageChrome";
import { ReportDialog } from "../../components/ReportDialog";
import {
  blockUser,
  fetchDmThread,
  markThreadRead,
  sendDirectMessage,
} from "../../lib/messaging";
import { pageHead } from "../../lib/seo";
import { cn, formatDateTime, formatTime, todayInTirana } from "../../lib/utils";

const POLL_MS = 5000;

export const Route = createFileRoute("/_authed/messages_/$userId")({
  loader: async ({ params }) => {
    const thread = await fetchDmThread({ data: { userId: params.userId } });
    await markThreadRead({ data: { userId: params.userId } });
    return thread;
  },
  head: ({ loaderData }) =>
    pageHead(
      loaderData ? `Chat with ${loaderData.otherName}` : "Messages",
      undefined,
      { noindex: true },
    ),
  pendingComponent: () => (
    <div className="flex flex-col gap-6" aria-busy>
      <div className="h-9 w-32 animate-pulse rounded-full bg-muted" />
      <div className="h-[50dvh] animate-pulse rounded-2xl bg-muted" />
    </div>
  ),
  errorComponent: () => (
    <RouteError
      title="Could not load this conversation"
      backTo="/messages"
      backLabel="Back to messages"
    />
  ),
  // Remount per counterpart so state never leaks between threads.
  component: ThreadRoute,
});

/** Remount per counterpart so state never leaks between threads. */
function ThreadRoute() {
  const { userId } = Route.useParams();
  return <ThreadPage key={userId} />;
}

function ThreadPage() {
  const initial = Route.useLoaderData();
  const { userId } = Route.useParams();
  const router = useRouter();

  const [messages, setMessages] = useState(initial.messages);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    setMessages(initial.messages);
  }, [initial.messages]);

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
      if (active && document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
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
    try {
      const result = await sendDirectMessage({
        data: { recipientId: userId, body: trimmed },
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

  async function handleBlock() {
    const result = await blockUser({ data: { userId } });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${initial.otherName} is blocked.`);
    await router.navigate({ to: "/messages" });
  }

  const today = todayInTirana();
  const lastMessage = messages[messages.length - 1];

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BackLink to="/messages">Messages</BackLink>
          <Link
            to="/people/$userId"
            params={{ userId }}
            className="flex min-w-0 items-center gap-2 rounded-full hover:underline"
          >
            <Avatar
              name={initial.otherName}
              url={initial.other?.avatar_url ?? null}
              size="sm"
            />
            <h1 className="truncate text-base font-semibold text-foreground sm:text-lg">
              {initial.otherName}
            </h1>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <ReportDialog reportedUserId={userId} />
          <ConfirmButton
            title={`Block ${initial.otherName}?`}
            description="They will no longer be able to message you, and you will not see each other in search or venue feeds. You can unblock from your account page."
            confirmLabel="Block"
            onConfirm={handleBlock}
            className={pillClass("text-xs", { danger: true })}
          >
            Block
          </ConfirmButton>
        </div>
      </div>

      <ul
        ref={listRef}
        className="flex flex-1 flex-col gap-2 overflow-y-auto rounded-2xl border border-border bg-card p-5"
        aria-label={`Conversation with ${initial.otherName}`}
      >
        {messages.length === 0 ? (
          <li className="py-8 text-center text-sm text-muted-foreground">
            No messages yet. Send the first one below.
          </li>
        ) : (
          messages.map((message) => {
            const isToday = message.created_at.slice(0, 10) === today;
            return (
              <li
                key={message.id}
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                  message.is_mine
                    ? "self-end bg-primary text-primary-foreground"
                    : "self-start bg-muted text-foreground",
                )}
              >
                <p className="whitespace-pre-wrap break-words">
                  {message.body}
                </p>
                <time
                  dateTime={message.created_at}
                  className="mt-1 block text-[11px] opacity-60"
                >
                  {isToday
                    ? formatTime(message.created_at)
                    : formatDateTime(message.created_at)}
                  {message.is_mine && message.read_at ? " · Seen" : ""}
                </time>
              </li>
            );
          })
        )}
      </ul>
      {/* Only the newest message is announced, not the whole list on each poll. */}
      <p className="sr-only" aria-live="polite">
        {lastMessage && !lastMessage.is_mine
          ? `${initial.otherName}: ${lastMessage.body}`
          : ""}
      </p>

      <form
        onSubmit={handleSend}
        className="sticky bottom-0 flex gap-3 bg-background py-2"
      >
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a message…"
          maxLength={2000}
          aria-label="Message"
          autoComplete="off"
          className="h-11 flex-1 rounded-full border border-border bg-card px-5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={sending || !body.trim()}
          className={primaryPillClass("h-11 px-5")}
        >
          {sending ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
