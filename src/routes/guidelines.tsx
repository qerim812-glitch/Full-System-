import { createFileRoute, Link } from "@tanstack/react-router";

import { LegalList, LegalPage, LegalSection } from "../components/LegalPage";
import { CONTACT_EMAIL } from "../lib/legal";
import { pageHead } from "../lib/seo";

export const Route = createFileRoute("/guidelines")({
  head: () =>
    pageHead(
      "Community guidelines",
      "How to meet people safely on Social Circle, and what gets an account removed.",
    ),
  component: GuidelinesPage,
});

/**
 * Deliberately practical rather than legalistic.
 *
 * The enforceable rules live in the terms of service; this page exists because
 * a platform where strangers arrange to meet in person owes people usable
 * safety advice before their first meet, not a list of prohibitions.
 */
function GuidelinesPage() {
  return (
    <LegalPage
      title="Community guidelines"
      intro="Social Circle works because people show up, are decent to each other, and go home happy. Here is how to do the first two, and what we do when someone doesn't."
    >
      <LegalSection heading="Meeting someone for the first time">
        <p>
          You are meeting a stranger. That is the whole point, and it is also
          the thing to be sensible about.
        </p>
        <LegalList
          items={[
            <>
              <strong>Meet at the venue, not somewhere else.</strong> Bookings
              are at public cafés, lounges and bars for a reason. If someone
              pushes to move the first meet somewhere private, that is a
              refusal, not a negotiation.
            </>,
            <>
              <strong>Tell someone where you are going.</strong> The venue, the
              time, and who you are meeting. Your booking page has all three — a
              screenshot to a friend takes five seconds.
            </>,
            <>
              <strong>Arrange your own way there and back.</strong> Do not rely
              on someone you have just met for a lift home.
            </>,
            <>
              <strong>Keep your drink with you</strong> and do not accept one
              you did not see poured.
            </>,
            <>
              <strong>Leave whenever you want.</strong> You owe no one an
              explanation, an apology, or another round. "I'm going to head off"
              is a complete sentence.
            </>,
            <>
              <strong>Trust the feeling.</strong> If something is off, go. You
              will never regret leaving early; people regret staying out of
              politeness.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="Before you meet">
        <LegalList
          items={[
            "Chat in the app first. You do not have to give out your phone number, and you should not feel pressured to.",
            "Be suspicious of anyone who asks you for money, however good the story is. No exceptions, no matter how long you have been talking.",
            "A profile with no picture and no history is not proof of anything bad — but it is not proof of anything good either.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Being good company">
        <LegalList
          items={[
            "Show up, or cancel early. Cancelling an hour before is fine. Not turning up is not.",
            "Be the person your profile says you are — same name, same photo, same age.",
            "Take no for an answer the first time. Nobody owes you a conversation, a second meet, or their number.",
            "Venue chat is a room full of people, not a DM. Read it that way before you post.",
            "Review the visit, not the person. Reviews are for the venue.",
            "Respect the venue and its staff. You are a guest, and you are representing everyone here.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="What gets an account removed">
        <p>
          The full list is in the <Link to="/terms">terms of service</Link>. In
          practice, these are what we act on:
        </p>
        <LegalList
          items={[
            "Harassment, threats, or continuing to contact someone who stopped replying.",
            "Pretending to be someone else, or being under 18.",
            "Sexual content sent to someone who did not ask for it.",
            "Asking members for money, or any kind of scam.",
            "Fake reviews.",
            "Coming back on a new account after being suspended.",
          ]}
        />
        <p>
          Anything involving a credible threat to someone's safety gets the
          account removed immediately, and we will cooperate with the police.
        </p>
      </LegalSection>

      <LegalSection heading="If something goes wrong">
        <p>
          <strong>If you are in immediate danger, call 112.</strong> Do that
          first. Report to us afterwards.
        </p>
        <p>Otherwise, you have three tools and you can use all of them:</p>
        <LegalList
          items={[
            <>
              <strong>Block</strong> — they can no longer message you or see
              you. They are not told. Available from any profile or chat.
            </>,
            <>
              <strong>Report</strong> — sends it to our moderators with the
              exact message or review attached. The person is never told who
              reported them.
            </>,
            <>
              <strong>Email us</strong> at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> for
              anything that does not fit a report form.
            </>,
          ]}
        />
        <p>
          Reports are read by people, not filters. You will not always hear the
          outcome — we cannot tell you what we did about someone else's account
          — but every report is looked at.
        </p>
        <p>
          Reporting someone in good faith never counts against you, even if we
          decide no action is needed.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
