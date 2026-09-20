import { fetchVenueChat, postVenueChat } from "../lib/messaging";
import { ChatRoom } from "./ChatRoom";

/** The per-venue room for everyone with a booking there. */
export function VenueChat({ venueSlug }: { venueSlug: string }) {
  return (
    <ChatRoom
      title="Venue chat"
      subtitle="Everyone who booked here"
      fetchMessages={() => fetchVenueChat({ data: { venueSlug } })}
      sendMessage={(body) => postVenueChat({ data: { venueSlug, body } })}
      realtime={{
        table: "chat_messages",
        filter: `venue_slug=eq.${venueSlug}`,
      }}
      report={{ targetKind: "chat_message", venueSlug }}
      footer="You can post here once you have a confirmed booking at this venue."
    />
  );
}
