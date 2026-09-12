import { useRouter } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { setFavorite } from "../lib/favorites";
import { cn } from "../lib/utils";

/**
 * Optimistic heart button. Flips immediately and reverts on server error.
 * Must NOT be nested inside the venue card's <Link> — render as a sibling.
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
      const result = await setFavorite({ data: { venueSlug, favorited: next } });
      if (!result.ok) {
        setFavorited(!next);
        toast.error(result.error);
        return;
      }
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
        "inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/90 shadow-sm backdrop-blur transition-all hover:scale-110 hover:border-foreground/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60",
        favorited && "border-transparent bg-red-50 dark:bg-red-950/30",
        className,
      )}
    >
      <Heart
        aria-hidden="true"
        className={cn(
          "h-4 w-4 transition-colors",
          favorited ? "fill-red-500 text-red-500" : "text-muted-foreground",
        )}
      />
    </button>
  );
}
