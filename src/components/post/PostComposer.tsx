import { useRouter } from "@tanstack/react-router";
import { ImagePlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { createPost, POST_PHOTO_MAX_BYTES } from "../../lib/posts";
import { cn } from "../../lib/utils";
import { pillClass, primaryPillClass } from "../PageChrome";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

/**
 * Write a post or a story.
 *
 * Submits as multipart so the photo travels with the text in one request;
 * the server does the upload because the browser cannot see the session.
 */
export function PostComposer({
  venues,
  initialVenueSlug,
  initialStory = false,
  meetupId,
}: {
  venues: Array<{ slug: string; name: string }>;
  initialVenueSlug?: string | undefined;
  initialStory?: boolean | undefined;
  meetupId?: string | undefined;
}) {
  const router = useRouter();
  const [story, setStory] = useState(initialStory);
  const [body, setBody] = useState("");
  const [venueSlug, setVenueSlug] = useState(initialVenueSlug ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function choosePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;
    if (file.size > POST_PHOTO_MAX_BYTES) {
      toast.error("Photos must be under 5 MB.");
      return;
    }
    setPhoto(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (story && !photo) {
      toast.error("A story needs a photo.");
      return;
    }
    if (!story && !body.trim() && !photo) {
      toast.error("Write something or add a photo.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("kind", story ? "story" : "post");
      form.append("body", body);
      if (venueSlug) form.append("venueSlug", venueSlug);
      if (meetupId) form.append("meetupId", meetupId);
      if (photo) form.append("photo", photo);
      const result = await createPost({ data: form });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(story ? "Story posted." : "Posted.");
      await router.invalidate();
      await router.navigate({ to: "/feed" });
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <div
        role="group"
        aria-label="Kind"
        className="flex w-fit gap-0.5 rounded-full border border-border bg-background p-0.5"
      >
        {(
          [
            ["post", "Post"],
            ["story", "Story · 24 h"],
          ] as const
        ).map(([value, label]) => {
          const active = story === (value === "story");
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => setStory(value === "story")}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="space-y-1">
        <Label htmlFor="post-body">{story ? "Caption" : "What's up?"}</Label>
        <Textarea
          id="post-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={1000}
          rows={story ? 2 : 4}
          placeholder={
            story
              ? "Say where you are…"
              : "Where are you heading tonight? Who's in?"
          }
          autoFocus
        />
        <p className="text-right text-[11px] text-muted-foreground">
          {body.length}/1000
        </p>
      </div>

      {preview ? (
        <div className="relative overflow-hidden rounded-xl bg-muted">
          <img
            src={preview}
            alt="Selected photo"
            className="max-h-96 w-full object-contain"
          />
          <button
            type="button"
            onClick={() => setPhoto(null)}
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
            aria-label="Remove photo"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={choosePhoto}
          className="sr-only"
          aria-label="Choose a photo"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={pillClass("gap-1.5")}
        >
          <ImagePlus className="h-4 w-4" aria-hidden />
          {photo ? "Change photo" : "Add photo"}
        </button>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="sr-only sm:not-sr-only">Venue</span>
          <select
            value={venueSlug}
            onChange={(e) => setVenueSlug(e.target.value)}
            className="h-9 max-w-[14rem] rounded-full border border-border bg-background px-3 text-sm text-foreground"
            aria-label="Tag a venue"
          >
            <option value="">No venue</option>
            {venues.map((v) => (
              <option key={v.slug} value={v.slug}>
                {v.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={busy}
          className={primaryPillClass("ml-auto")}
        >
          {busy ? "Posting…" : story ? "Share story" : "Post"}
        </button>
      </div>
    </form>
  );
}
