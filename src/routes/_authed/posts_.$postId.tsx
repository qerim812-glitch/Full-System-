import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Avatar } from "../../components/Avatar";
import { ConfirmButton } from "../../components/ConfirmButton";
import {
  BackLink,
  primaryPillClass,
  RouteError,
} from "../../components/PageChrome";
import { PostCard } from "../../components/post/PostCard";
import { ReportDialog } from "../../components/ReportDialog";
import {
  addComment,
  deleteComment,
  fetchComments,
  fetchPost,
} from "../../lib/posts";
import { pageHead } from "../../lib/seo";
import { formatRelative } from "../../lib/utils";

export const Route = createFileRoute("/_authed/posts_/$postId")({
  loader: async ({ params }) => {
    const [post, comments] = await Promise.all([
      fetchPost({ data: { id: params.postId } }),
      fetchComments({ data: { postId: params.postId } }),
    ]);
    return { post, comments };
  },
  head: ({ loaderData }) =>
    pageHead(
      loaderData?.post
        ? `${loaderData.post.author.display_name ?? "Member"}'s post`
        : "Post",
      loaderData?.post?.body ?? "",
      { noindex: true, image: loaderData?.post?.photo_url ?? null },
    ),
  errorComponent: () => (
    <RouteError title="Could not load this post" backTo="/feed" />
  ),
  component: PostPage,
});

function PostPage() {
  const { post, comments: initial } = Route.useLoaderData();
  const router = useRouter();
  const [comments, setComments] = useState(initial);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  if (!post) {
    return (
      <RouteError
        title="This post is gone"
        body="It was deleted, or you do not have access to it."
        backTo="/feed"
        backLabel="Back to Tonight"
      />
    );
  }

  async function refresh() {
    setComments(await fetchComments({ data: { postId: post!.id } }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const result = await addComment({
        data: { postId: post!.id, body: trimmed },
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
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    const result = await deleteComment({ data: { id } });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    await refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <BackLink to="/feed">Back to Tonight</BackLink>

      <PostCard
        post={post}
        showComments={false}
        onDeleted={() => {
          void router.navigate({ to: "/feed" });
        }}
      />

      <section
        className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
        aria-label="Comments"
      >
        <h2 className="text-sm font-semibold text-foreground">
          Comments{comments.length > 0 ? ` (${comments.length})` : ""}
        </h2>

        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No comments yet. Say something.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {comments.map((comment) => {
              const name = comment.author.display_name?.trim() || "Member";
              return (
                <li key={comment.id} className="flex items-start gap-3">
                  <Link
                    to="/people/$userId"
                    params={{ userId: comment.user_id }}
                  >
                    <Avatar
                      name={name}
                      url={comment.author.avatar_url}
                      size="xs"
                      tone="muted"
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">
                      <Link
                        to="/people/$userId"
                        params={{ userId: comment.user_id }}
                        className="font-semibold hover:underline"
                      >
                        {name}
                      </Link>{" "}
                      <span className="whitespace-pre-wrap break-words">
                        {comment.body}
                      </span>
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <time dateTime={comment.created_at}>
                        {formatRelative(comment.created_at)}
                      </time>
                      {comment.is_mine ? (
                        <ConfirmButton
                          title="Delete this comment?"
                          description="It is removed for everyone."
                          confirmLabel="Delete"
                          onConfirm={() => handleDelete(comment.id)}
                          className="inline-flex items-center gap-1 hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden />
                          Delete
                        </ConfirmButton>
                      ) : (
                        <ReportDialog
                          compact
                          reportedUserId={comment.user_id}
                          targetKind="post_comment"
                          targetId={comment.id}
                        />
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment…"
            maxLength={500}
            aria-label="Comment"
            autoComplete="off"
            className="h-10 flex-1 rounded-full border border-border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={busy || !body.trim()}
            className={primaryPillClass("h-10 px-4")}
          >
            {busy ? "…" : "Post"}
          </button>
        </form>
      </section>
    </div>
  );
}
