import { useState } from "react";
import { toast } from "sonner";

import { fetchPosts, type FeedScope, type Post } from "../../lib/posts";
import { EmptyState } from "../EmptyState";
import { pillClass } from "../PageChrome";
import { PostCard } from "./PostCard";

/**
 * A list of posts with a "Load more" tail.
 *
 * The first page arrives from the route loader so the page renders with
 * content; older pages are fetched here on demand, keyed by the timestamp of
 * the last post shown, which is stable under new posts arriving at the top.
 */
export function PostFeed({
  initial,
  scope,
  userId,
  venueSlug,
  emptyTitle = "No posts yet",
  emptyBody = "Be the first to share something.",
}: {
  initial: { posts: Post[]; nextBefore: string | null };
  scope: FeedScope;
  userId?: string;
  venueSlug?: string;
  emptyTitle?: string;
  emptyBody?: string;
}) {
  const [posts, setPosts] = useState(initial.posts);
  const [nextBefore, setNextBefore] = useState(initial.nextBefore);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    if (!nextBefore || loading) return;
    setLoading(true);
    try {
      const page = await fetchPosts({
        data: { scope, userId, venueSlug, before: nextBefore },
      });
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...page.posts.filter((p) => !seen.has(p.id))];
      });
      setNextBefore(page.nextBefore);
    } catch {
      toast.error("Could not load more posts.");
    } finally {
      setLoading(false);
    }
  }

  if (posts.length === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-4">
        {posts.map((post) => (
          <li key={post.id}>
            <PostCard
              post={post}
              onDeleted={(id) =>
                setPosts((prev) => prev.filter((p) => p.id !== id))
              }
            />
          </li>
        ))}
      </ul>
      {nextBefore ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loading}
          className={pillClass("self-center")}
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
