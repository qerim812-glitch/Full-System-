import { fetchMeetupChat, postMeetupChat } from "../../lib/meetup-chat";
import { ChatRoom } from "../ChatRoom";

/** The group chat for a meetup's host and confirmed guests. */
export function MeetupChat({
  meetupId,
  venueSlug,
  going,
  readOnly,
}: {
  meetupId: string;
  venueSlug: string;
  going: number;
  readOnly: boolean;
}) {
  return (
    <ChatRoom
      title="Group chat"
      subtitle={`${going} going`}
      fetchMessages={() => fetchMeetupChat({ data: { meetupId } })}
      sendMessage={(body) => postMeetupChat({ data: { meetupId, body } })}
      realtime={{
        table: "meetup_messages",
        filter: `meetup_id=eq.${meetupId}`,
      }}
      report={{ targetKind: "meetup_message", venueSlug }}
      disabled={readOnly}
      disabledReason="This meetup was cancelled, so the room is read-only."
      footer="Only the host and confirmed guests can see this chat."
    />
  );
}
