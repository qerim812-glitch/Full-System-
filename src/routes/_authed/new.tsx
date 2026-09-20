import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { BackLink, PageHeader, RouteError } from "../../components/PageChrome";
import { PostComposer } from "../../components/post/PostComposer";
import { pageHead } from "../../lib/seo";
import { fetchVenues } from "../../lib/venues";

const searchSchema = z.object({
  story: z.boolean().optional(),
  venue: z.string().max(120).optional(),
  meetup: z.string().uuid().optional(),
});

/** The "+" in the nav: write a post or share a story. */
export const Route = createFileRoute("/_authed/new")({
  validateSearch: (search) => searchSchema.parse(search),
  loader: async () => {
    const venues = await fetchVenues();
    return {
      venues: venues
        .map((v) => ({ slug: v.slug, name: v.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
  head: () => pageHead("New post", "", { noindex: true }),
  errorComponent: () => <RouteError title="Could not open the composer" />,
  component: NewPostPage,
});

function NewPostPage() {
  const { venues } = Route.useLoaderData();
  const { story, venue, meetup } = Route.useSearch();

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <BackLink to="/feed">Back to Tonight</BackLink>
      <PageHeader
        title={story ? "Share a story" : "New post"}
        subtitle={
          story
            ? "A photo that disappears after 24 hours."
            : "Tell people where you're going, or what you found."
        }
      />
      <PostComposer
        venues={venues}
        initialStory={story ?? false}
        initialVenueSlug={venue}
        meetupId={meetup}
      />
    </div>
  );
}
