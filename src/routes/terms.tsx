import { createFileRoute, Link } from "@tanstack/react-router";

import { LegalList, LegalPage, LegalSection } from "../components/LegalPage";
import { CONTACT_EMAIL, OPERATOR_NAME } from "../lib/legal";
import { pageHead } from "../lib/seo";

export const Route = createFileRoute("/terms")({
  head: () =>
    pageHead(
      "Terms of service",
      "The rules for using Social Circle — bookings, conduct, and what happens when they are broken.",
    ),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      intro="These are the rules for using Social Circle. By creating an account you agree to them."
    >
      <LegalSection heading="Who we are, and who can join">
        <p>
          Social Circle is operated by <strong>{OPERATOR_NAME}</strong>. It is a
          platform for booking tables at venues in Tirana and meeting the other
          people who booked.
        </p>
        <p>
          <strong>You must be 18 or over.</strong> We check your date of birth
          when you sign up. Giving a false date of birth is grounds for
          immediate removal. Individual venues may set a higher minimum or a
          maximum age, which is checked when you book.
        </p>
        <p>
          One account per person. Keep your password to yourself — you are
          responsible for what happens under your account.
        </p>
      </LegalSection>

      <LegalSection heading="Bookings">
        <LegalList
          items={[
            "A booking is a reservation with the venue, not a contract with us. We pass on your reservation; we do not own, run or control the venues.",
            "Seats are limited and bookings are first come, first served. A slot can fill between you opening the page and confirming.",
            "You can cancel or reschedule from your bookings page. Do it early if you cannot make it — an unused table costs the venue money and a seat that someone else wanted.",
            "Venue opening hours, prices, age limits and capacity come from the venue and can change. We show what we have been told.",
            "You cannot book a time that has already passed, and you cannot hold two confirmed bookings for the same slot at the same venue.",
          ]}
        />
        <p>
          Anything you pay at the venue is between you and the venue. We take no
          payment for bookings and no commission from them.
        </p>
      </LegalSection>

      <LegalSection heading="Meeting people — and your own safety">
        <p>
          Social Circle helps you find people to go out with. It does not vet
          them. We do not run background checks, and a profile is not proof that
          someone is who they say they are.
        </p>
        <p>
          <strong>
            You are responsible for your own safety when you meet someone.
          </strong>{" "}
          Read our <Link to="/guidelines">community guidelines</Link> before
          your first meet — they contain practical advice, not just rules.
        </p>
      </LegalSection>

      <LegalSection heading="How to behave">
        <p>You agree not to:</p>
        <LegalList
          items={[
            "Harass, threaten, stalk, impersonate or abuse anyone.",
            "Post content that is illegal, hateful, sexually explicit, or that sexualises minors in any way.",
            "Spam, advertise, or use the platform to sell things.",
            "Write fake reviews, or reviews for a visit that did not happen.",
            "Share anyone else's personal information without their permission.",
            "Scrape, automate, reverse-engineer, or attack the service or the people on it.",
            "Create a new account to get around a suspension.",
          ]}
        />
        <p>
          Reports are read by real people. We may hide content, suspend an
          account, or remove it permanently. For anything involving a credible
          threat to someone's safety, we will act first and discuss it
          afterwards, and we will involve the police where appropriate.
        </p>
      </LegalSection>

      <LegalSection heading="Your content">
        <p>
          Your reviews, messages, photos and notes stay yours. By posting them
          you give us permission to store and display them within the service so
          that it works — showing your review on a venue page, delivering your
          message to the person you sent it to.
        </p>
        <p>
          We can remove content that breaks these terms. Deleting your account
          removes your content, with the exceptions set out in the{" "}
          <Link to="/privacy">privacy policy</Link>.
        </p>
      </LegalSection>

      <LegalSection heading="Donations">
        <p>
          Donations are voluntary, are not payment for anything, and are not
          refundable except where the law requires it. They do not buy priority
          bookings, a better profile, or any other advantage. Card payments are
          handled by our payment provider; we never see your card details.
        </p>
      </LegalSection>

      <LegalSection heading="What we do not promise">
        <p>
          The service is provided as it is. We do not guarantee it will be
          available without interruption, that a venue will honour a booking,
          that the information a venue gave us is accurate, or that you will get
          along with anyone you meet.
        </p>
        <p>
          To the extent the law allows, we are not liable for what happens
          between you and a venue, or between you and another member, including
          anything that happens when you meet in person. Nothing here limits
          liability that cannot legally be limited — including for death or
          personal injury caused by our negligence, or for fraud.
        </p>
      </LegalSection>

      <LegalSection heading="Ending it">
        <p>
          You can delete your account at any time from your account page,
          without asking us. We can suspend or close an account that breaks
          these terms, and will tell you why unless doing so would help someone
          evade a safety measure.
        </p>
      </LegalSection>

      <LegalSection heading="Changes, and the law that applies">
        <p>
          We will tell you in the app before a material change takes effect.
          Continuing to use Social Circle after that means you accept the new
          terms.
        </p>
        <p>
          These terms are governed by the law of the Republic of Albania, and
          the courts of Tirana have jurisdiction. If you are a consumer
          elsewhere, this does not remove protections you have under your own
          local law.
        </p>
        <p>
          Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
