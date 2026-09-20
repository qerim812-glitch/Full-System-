import { Link } from "@tanstack/react-router";
import { Heart, MapPin, MessageCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { deletePost, setPostLiked, type Post } from "../../lib/posts";
import { cn, formatRelative } from "../../lib/utils";
import { Avatar } from "../Avatar";
import { ConfirmButton } from "../ConfirmButton";
import { ReportDialog } from "../ReportDialog";
import { VerifiedBadge } from "../VerifiedBadge";

/**
 * One post in the feed.
 *
 * The like is optimistic: the heart fills and the count moves at once, and
 * only roll back if the server says no. Waiting for the round trip makes a
 * tap feel like it missed.
 */
export function PostCard({
  post,
  onDeleted,
  showComments = true,
}: {
  post: Post;
  onDeleted?: (id: string) => void;
  /** Off on the post's own page, where the comments are right below. */
  showComments?: boolean;
}) {
  const [liked, setLiked] = useState(post.liked_by_me);
  const [likes, setLikes] = useState(post.like_count);
  const [busy, setBusy] = useState(false);

  async function toggleLike() {
    if (busy) return;
    const next = !liked;
    setLiked(next);
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)));
    setBusy(true);
    try {
      const result = await setPostLiked({
        data: { postId: post.id, liked: next },
      });
      if (!result.ok) throw new Error(result.error);
    } catch {
      setLiked(!next);
      setLikes((n) => Math.max(0, n + (next ? -1 : 1)));
      toast.error("Could not update that like.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    const result = await deletePost({ data: { id: post.id } });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Post deleted.");
    onDeleted?.(post.id);
  }

  const name = post.author.display_name?.trim() || "Member";

  return (
    <article
      id={`post-${post.id}`}
      className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      <header className="flex items-center gap-3 px-4 pt-4">
        <Link to="/people/$userId" params={{ userId: post.user_id }}>
          <Avatar
            name={name}
            url={post.author.avatar_url}
            size="sm"
            tone="muted"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
            <Link
              to="/people/$userId"
              params={{ userId: post.user_id }}
              className="hover:underline"
            >
              {name}
            </Link>
            {post.author.is_verified ? <VerifiedBadge /> : null}
            {post.kind === "checkin" ? (
              <span className="font-normal text-muted-foreground">
                checked in
              </span>
            ) : null}
          </p>
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <time dateTime={post.created_at}>
              {formatRelative(post.created_at)}
            </time>
            {post.venue_slug ? (
              <>
                <span aria-hidden>·</span>
                <Link
                  to="/venues/$slug"
                  params={{ slug: post.venue_slug }}
                  className="inline-flex items-center gap-0.5 hover:underline"
                >
                  <MapPin className="h-3 w-3" aria-hidden />
                  {post.venue_name ?? post.venue_slug}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        {post.is_mine ? (
          <ConfirmButton
            title="Delete this post?"
            description="It disappears for everyone, along with its likes and comments."
            confirmLabel="Delete"
            onConfirm={handleDelete}
            className="rounded-full p-2 text-muted-foreground transition-colors hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            <span className="sr-only">Delete post</span>
          </ConfirmButton>
        ) : (
          <ReportDialog
            compact
            reportedUserId={post.user_id}
            targetKind="post"
            targetId={post.id}
          />
        )}
      </header>

      {post.body ? (
        <p className="whitespace-pre-wrap break-words px-4 pt-3 text-sm text-foreground">
          {post.body}
        </p>
      ) : null}

      {post.photo_url ? (
        <Link
          to="/posts/$postId"
          params={{ postId: post.id }}
          className="mt-3 block bg-muted"
        >
          <img
            src={post.photo_url}
            alt={post.body ?? `Photo by ${name}`}
            loading="lazy"
            className="max-h-[32rem] w-full object-cover"
          />
        </Link>
      ) : null}

      <footer className="flex items-center gap-1 px-2 py-2">
        <button
          type="button"
          onClick={() => void toggleLike()}
          aria-pressed={liked}
          aria-label={liked ? "Unlike" : "Like"}
          className="flex h-10 items-center gap-1.5 rounded-full px-3 text-sm text-foreground transition-transform active:scale-90"
        >
          <Heart
            className={cn(
              "h-6 w-6 transition-colors",
              liked && "fill-destructive text-destructive",
            )}
            aria-hidden
          />
          <span className="tabular-nums">{likes > 0 ? likes : ""}</span>
        </button>
        {showComments ? (
          <Link
            to="/posts/$postId"
            params={{ postId: post.id }}
            className="flex h-10 items-center gap-1.5 rounded-full px-3 text-sm text-foreground"
            aria-label="Comments"
          >
            <MessageCircle className="h-6 w-6" aria-hidden />
            <span className="tabular-nums">
              {post.comment_count > 0 ? post.comment_count : ""}
            </span>
          </Link>
        ) : null}
      </footer>
    </article>
  );
}
