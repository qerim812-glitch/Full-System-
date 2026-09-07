import { useRouter } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { toggleFavorite } from "../lib/favorites";
import { cn } from "../lib/utils";

/**
 * Optimistic on purpose: the heart flips immediately and reverts if the
 * server disagrees. A favourite is low-stakes enough that waiting on a round
 * trip reads as a broken button.
 *
 * Note for callers on the venue list: this renders a <button>, so it must not
 * be placed inside the card's <Link>. Nesting a button in an anchor is
 * invalid HTML and screen readers handle it inconsistently — render it as a
 * sibling of the link instead.
 */
export function FavoriteButton({
  venueSlug,
  initialFavorited,
  className,
}: {
  venueSlug: string;
  initialFavorited: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, setPending] = useState(false);

  async function handleClick() {
    const next = !favorited;
    setFavorited(next);
    setPending(true);

    try {
      const result = await toggleFavorite({ data: { venueSlug } });

      if (!result.ok) {
        setFavorited(!next);
        toast.error(result.error);
        return;
      }
      // Trust the server's answer over the guess, in case a concurrent
      // request already changed the state.
      setFavorited(result.favorited);
      await router.invalidate();
    } catch {
      setFavorited(!next);
      toast.error("Could not reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={favorited}
      aria-label={favorited ? "Remove from favourites" : "Add to favourites"}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-full border border-border bg-background/90 backdrop-blur transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60",
        className,
      )}
    >
      <Heart
        aria-hidden="true"
        className={cn(
          "size-4",
          favorited ? "fill-red-500 text-red-500" : "text-muted-foreground",
        )}
      />
    </button>
  );
}
