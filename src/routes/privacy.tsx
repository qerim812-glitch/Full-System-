import { createFileRoute, Link } from "@tanstack/react-router";

import { LegalList, LegalPage, LegalSection } from "../components/LegalPage";
import { CONTACT_EMAIL, OPERATOR_ADDRESS, OPERATOR_NAME } from "../lib/legal";
import { pageHead } from "../lib/seo";

export const Route = createFileRoute("/privacy")({
  head: () =>
    pageHead(
      "Privacy policy",
      "What Social Circle collects about you, why, and how to get it back or delete it.",
    ),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro="This explains what we store about you, why we store it, who else can see it, and how to get a copy or delete it. It is written to match what the software actually does."
    >
      <LegalSection heading="Who is responsible">
        <p>
          <strong>{OPERATOR_NAME}</strong>, {OPERATOR_ADDRESS}, operates Social
          Circle and is the data controller for the information described here.
          For anything in this policy, write to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
        <p>
          Social Circle is for people aged 18 and over. We check your date of
          birth at sign-up and refuse accounts below that age. If you believe a
          minor has an account, tell us and we will remove it.
        </p>
      </LegalSection>

      <LegalSection heading="What we collect">
        <p>
          <strong>Your account.</strong> Email address, display name, date of
          birth, and a profile picture if you upload one. Your password is
          handled by our authentication provider and stored only as a hash — we
          never see it.
        </p>
        <p>
          <strong>What you do on the service.</strong>
        </p>
        <LegalList
          items={[
            "Bookings: the venue and branch, date, time, party size, any special request you type, and a confirmation code.",
            "Reviews: your star rating and comment, shown publicly with your name and picture.",
            "Messages: venue chat messages and direct messages, including their text and when they were sent and read.",
            "Social activity: who you are connected to, which venues you mark as favourites, and check-ins saying you plan to be at a venue on a date, with an optional short note.",
            "Safety records: reports you file, reports filed about you, and who you have blocked.",
            "Donations: the amount, currency, method, an optional message, and — for card payments — the name, email and transaction reference our payment provider sends us.",
          ]}
        />
        <p>
          <strong>Technical data.</strong> A session cookie that keeps you
          signed in, set as <code>httpOnly</code> so page scripts cannot read
          it. Our hosting and database providers record server logs that include
          IP addresses. If error reporting is enabled on this deployment, a
          crash may send us the error, the page it happened on and your account
          identifier.
        </p>
        <p>
          We do not use advertising cookies, and we do not track you across
          other websites.
        </p>
      </LegalSection>

      <LegalSection heading="Why we are allowed to use it">
        <LegalList
          items={[
            <>
              <strong>To provide the service you asked for</strong> — your
              account, bookings, messages and connections. Without this data
              there is no service.
            </>,
            <>
              <strong>Our legitimate interest in keeping people safe</strong> —
              reports, blocks, suspensions and the admin audit log. A platform
              where strangers arrange to meet in person cannot operate without a
              way to act on abuse.
            </>,
            <>
              <strong>Legal obligation</strong> — donation records, which we
              keep for financial and tax purposes.
            </>,
            <>
              <strong>Your consent</strong> — your profile picture, and any
              optional field you choose to fill in. You can withdraw it by
              removing them.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="Who can see what">
        <p>
          <strong>Other members</strong> can see your display name, profile
          picture, your reviews, your check-ins, and messages you send them.
          Your <strong>email address and date of birth are never shown</strong>{" "}
          to other members — the age limits on venues are checked by the server
          without revealing your birth date.
        </p>
        <p>
          <strong>Suspended accounts</strong> are hidden from search and from
          other members entirely.
        </p>
        <p>
          <strong>Administrators</strong> can see account details, bookings,
          reviews, reports and chat content in order to handle reports and run
          the service. Every administrator action is written to an append-only
          audit log.
        </p>
        <p>
          <strong>Venues</strong> receive the information needed to hold your
          table, such as a name, party size and time.
        </p>
      </LegalSection>

      <LegalSection heading="Companies that process data for us">
        <LegalList
          items={[
            "Supabase — database, authentication and file storage.",
            "Vercel — application hosting and server logs.",
            "Buy Me a Coffee — card payments, if you donate that way. They handle the card details; we only receive a record that a payment happened.",
            "An error-monitoring provider, if enabled on this deployment, to receive crash reports.",
          ]}
        />
        <p>
          These providers act on our instructions. Some operate outside Albania
          and the European Economic Area; where they do, transfers rely on
          standard contractual clauses or an equivalent safeguard.
        </p>
        <p>We do not sell your data. We never have and we will not.</p>
      </LegalSection>

      <LegalSection heading="How long we keep it">
        <LegalList
          items={[
            "Account data, bookings, reviews, messages and connections: until you delete your account.",
            "Reports and blocks: kept after the account involved is deleted, in a form that no longer identifies the deleted person, because a safety record that vanishes with the account is useless.",
            "Donation records: kept for as long as financial law requires, with the link to your account removed when you delete it. The amount survives; your identity does not.",
            "The administrator audit log: append-only and retained, since a record that can be edited or erased is not an audit log.",
            "Server logs: kept for the short period our hosting providers retain them.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Your rights">
        <p>
          You can exercise the first two of these yourself, immediately, from{" "}
          <Link to="/account">your account page</Link>:
        </p>
        <LegalList
          items={[
            <>
              <strong>Get a copy.</strong> "Download my data" gives you
              everything we hold about you as a JSON file.
            </>,
            <>
              <strong>Delete your account.</strong> This erases your profile,
              bookings, reviews, messages, connections and check-ins. It cannot
              be undone.
            </>,
            <>
              <strong>Correct it.</strong> Change your name and picture in your
              account; email us for anything else.
            </>,
            <>
              <strong>Object or restrict.</strong> Ask us to stop a particular
              use of your data.
            </>,
          ]}
        />
        <p>
          You also have the right to complain to a supervisory authority. In
          Albania that is the Information and Data Protection Commissioner
          (IDP); if you are in the European Economic Area, it is your national
          data protection authority.
        </p>
        <p>
          Write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and
          we will respond within 30 days.
        </p>
      </LegalSection>

      <LegalSection heading="Security">
        <p>
          Access to data is enforced in the database itself through row-level
          security, not only in the application, so a bug in a page cannot
          expose rows you are not entitled to. Session tokens are stored in
          <code> httpOnly</code> cookies. Administrator access requires a
          privilege that cannot be granted from the browser.
        </p>
        <p>
          No service is perfectly secure. If we discover a breach affecting your
          personal data, we will notify you and the supervisory authority as the
          law requires.
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          If we change this policy in a way that materially affects you, we will
          tell you in the app before it takes effect. The date at the top always
          reflects the current version.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
