import LegalLayout, { type LegalSection } from "@/components/legal-layout";

export const metadata = {
  title: "Privacy Policy — SpecialCarer",
  description:
    "How SpecialCarer (All Care 4 U Group Limited) collects, uses, and protects your personal data.",
};

const sections: LegalSection[] = [
  { id: "summary", title: "At a glance" },
  { id: "controller", title: "Who we are" },
  { id: "data-we-collect", title: "Data we collect" },
  { id: "purposes", title: "How and why we use it" },
  { id: "lawful-bases", title: "Lawful bases (UK/EU)" },
  { id: "sharing", title: "Who we share it with" },
  { id: "international", title: "International transfers" },
  { id: "retention", title: "How long we keep it" },
  { id: "rights", title: "Your rights" },
  { id: "ccpa", title: "California (CCPA/CPRA) rights" },
  { id: "security", title: "Security" },
  { id: "children", title: "Children" },
  { id: "background-checks", title: "Background checks" },
  { id: "location", title: "Location data" },
  { id: "cookies", title: "Cookies & tracking" },
  { id: "changes", title: "Changes" },
  { id: "contact", title: "Contact us" },
];

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      updated="3 May 2026"
      sections={sections}
      jurisdictionNote="This policy applies to users of SpecialCarer in the United Kingdom, the European Economic Area, and the United States. California residents should also read the dedicated CCPA/CPRA section below."
    >
      <h2 id="summary">At a glance</h2>
      <p>
        SpecialCarer is a marketplace that connects families with vetted
        caregivers. To make that work safely we have to collect and process
        personal data. The short version:
      </p>
      <ul>
        <li>
          <strong>You give us</strong> your name, contact details, payment
          information, and (for caregivers) the documents needed for
          background checks.
        </li>
        <li>
          <strong>We collect automatically</strong> log data, device
          information, and—only during a confirmed shift—your live location
          if you are the caregiver.
        </li>
        <li>
          <strong>We share</strong> the minimum needed with the people you
          are matched with, our payment processor (Stripe), our background-check
          providers, and the cloud platforms that host the service.
        </li>
        <li>
          <strong>You can</strong> access, export, correct, or delete your
          data at any time at{" "}
          <a href="/account/delete">specialcarer.com/account/delete</a> or by
          emailing{" "}
          <a href="mailto:privacy@allcare4u.co.uk">privacy@allcare4u.co.uk</a>.
        </li>
        <li>
          <strong>We never sell your personal information.</strong>
        </li>
      </ul>

      <h2 id="controller">Who we are</h2>
      <p>
        SpecialCarer is operated by <strong>All Care 4 U Group Limited</strong>
        , a company registered in England and Wales (company number{" "}
        <strong>09428739</strong>) with its registered office at 85 Great
        Portland Street, London, England, W1W 7LT. We are the{" "}
        <em>data controller</em> for the personal data described in this
        policy.
      </p>
      <p>
        Our Data Protection contact is{" "}
        <a href="mailto:privacy@allcare4u.co.uk">privacy@allcare4u.co.uk</a>.
      </p>

      <h2 id="data-we-collect">Data we collect</h2>
      <h3>Account and profile</h3>
      <ul>
        <li>Name, email address, mobile phone number, postal address.</li>
        <li>Date of birth (caregivers only — required for background checks).</li>
        <li>Profile photo, biography, languages, services offered (caregivers).</li>
        <li>Care needs, preferences, household details (families).</li>
      </ul>

      <h3>Verification and background-check data (caregivers only)</h3>
      <ul>
        <li>
          UK: identity documents and the inputs needed for an Enhanced DBS +
          Barred Lists check, Right to Work confirmation, and a digital
          identity verification (IDVT) process delivered by our supplier{" "}
          <strong>uCheck</strong> (uCheck Holdings Ltd).
        </li>
        <li>
          US: name, date of birth, last four digits of SSN, and addresses
          submitted to <strong>Checkr, Inc.</strong> for criminal-history and
          healthcare-sanctions screening (and an optional motor-vehicle
          report where applicable).
        </li>
        <li>
          Right-to-work status, DBS certificate number, OFAC/sanctions hit
          summary returned by the vendor. We store the result, not the raw
          underlying source documents.
        </li>
      </ul>

      <h3>Bookings and payments</h3>
      <ul>
        <li>
          Booking schedule, location, hourly rate, total, currency,
          messages exchanged in-app.
        </li>
        <li>
          Payment-method tokens (we never store your full card number — the
          card is held by <strong>Stripe</strong>, our PCI-DSS compliant
          payment processor; we keep only the last four digits and expiry
          for receipts).
        </li>
        <li>
          For caregivers receiving payouts: Stripe Connect account ID,
          payout history, fee breakdowns.
        </li>
      </ul>

      <h3>Location data (caregivers only, during active shifts)</h3>
      <ul>
        <li>
          Latitude/longitude pings collected at most every 15 seconds while
          a confirmed booking is in its scheduled window (from 15 minutes
          before start to 15 minutes after the scheduled end).
        </li>
        <li>
          Outside that window we do not collect location data, even with the
          app open. Location sharing can be stopped at any time.
        </li>
        <li>
          Pings are only visible to you (the caregiver) and the booking
          family, never to the public, never to other caregivers.
        </li>
      </ul>

      <h3>Device and log data</h3>
      <ul>
        <li>IP address, device model, OS version, app version, time zone.</li>
        <li>Timestamps of logins, error reports, and security events.</li>
        <li>
          Mobile push notification tokens (if you enable notifications on
          the iOS / Android app).
        </li>
      </ul>

      <h2 id="purposes">How and why we use your data</h2>
      <ul>
        <li>
          <strong>Run the service.</strong> Create and authenticate your
          account, match families with caregivers, schedule and process
          bookings, take payments and pay caregivers, deliver in-app
          messaging.
        </li>
        <li>
          <strong>Verify caregivers.</strong> Run statutory background
          checks (UK Enhanced DBS + Right to Work, US criminal +
          healthcare sanctions) and surface a clear &quot;cleared / not
          cleared&quot; status to families.
        </li>
        <li>
          <strong>Safety during shifts.</strong> Show families the live
          location of the assigned caregiver while a shift is active.
        </li>
        <li>
          <strong>Trust &amp; fraud prevention.</strong> Detect duplicate
          accounts, payment fraud, abusive behaviour. We may consult
          sanctions and politically-exposed-persons lists for compliance.
        </li>
        <li>
          <strong>Customer support.</strong> Answer your questions and
          resolve incidents.
        </li>
        <li>
          <strong>Legal obligations.</strong> UK tax (HMRC), US tax (IRS
          1099-NEC for US caregivers earning over $600/year), accounting,
          court orders, and regulator requests.
        </li>
        <li>
          <strong>Service improvement.</strong> Aggregated, de-identified
          analytics about feature usage. We do not profile you for
          advertising.
        </li>
      </ul>

      <h2 id="lawful-bases">Lawful bases (UK/EU)</h2>
      <p>
        Under the UK GDPR and EU GDPR we rely on the following lawful bases:
      </p>
      <ul>
        <li>
          <strong>Contract</strong> (Article 6(1)(b)) — to perform the
          contract you enter into with us when you book a shift or list as
          a caregiver.
        </li>
        <li>
          <strong>Legal obligation</strong> (Article 6(1)(c)) — for tax
          records, anti-money-laundering checks, and statutory caregiver
          screening.
        </li>
        <li>
          <strong>Legitimate interests</strong> (Article 6(1)(f)) — for
          fraud prevention, network security, and basic product analytics.
          You can object at any time.
        </li>
        <li>
          <strong>Consent</strong> (Article 6(1)(a)) — for non-essential
          cookies, marketing email, and push notifications. You can
          withdraw consent at any time.
        </li>
      </ul>
      <p>
        Background-check inputs (date of birth, identity documents) are
        special-category and criminal-offence data. We process them only
        with your consent and in reliance on Schedule 1, Part 2,
        paragraph 6 of the UK Data Protection Act 2018 (statutory and
        government purposes — DBS).
      </p>

      <h2 id="sharing">Who we share your data with</h2>
      <p>
        We share the minimum personal data necessary with the following
        categories of recipients, all under written data-processing
        agreements:
      </p>
      <table>
        <thead>
          <tr>
            <th>Recipient</th>
            <th>Why</th>
            <th>Where</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Stripe Payments Europe / Stripe, Inc.</td>
            <td>Card processing, payouts to caregivers</td>
            <td>Ireland, USA</td>
          </tr>
          <tr>
            <td>uCheck Holdings Ltd</td>
            <td>UK Enhanced DBS, Right to Work, Digital ID</td>
            <td>UK</td>
          </tr>
          <tr>
            <td>Checkr, Inc.</td>
            <td>US criminal &amp; healthcare-sanctions checks</td>
            <td>USA</td>
          </tr>
          <tr>
            <td>Supabase, Inc.</td>
            <td>Database, authentication, file storage</td>
            <td>USA / EU</td>
          </tr>
          <tr>
            <td>Vercel, Inc.</td>
            <td>Web hosting, edge network</td>
            <td>USA</td>
          </tr>
          <tr>
            <td>Mapbox, Inc.</td>
            <td>Map rendering during live tracking</td>
            <td>USA</td>
          </tr>
          <tr>
            <td>IONOS SE</td>
            <td>Email infrastructure for office@ accounts</td>
            <td>Germany</td>
          </tr>
          <tr>
            <td>Apple Inc. / Google LLC</td>
            <td>App distribution, push notifications</td>
            <td>USA</td>
          </tr>
          <tr>
            <td>Other counterparties to your booking</td>
            <td>The matched family or caregiver receives the booking-relevant subset of your profile</td>
            <td>UK / USA</td>
          </tr>
        </tbody>
      </table>
      <p>
        We will also disclose data where required by law (court order,
        regulator), in connection with a corporate sale or restructure, or
        to protect the safety of users.
      </p>
      <p>
        <strong>We do not sell or rent your personal information.</strong>
      </p>

      <h2 id="international">International transfers</h2>
      <p>
        Some of our processors (notably Stripe, Checkr, Mapbox, Supabase,
        Vercel) are located in the United States. Where personal data is
        transferred outside the UK or EEA we rely on the UK International
        Data Transfer Addendum and the European Commission&apos;s Standard
        Contractual Clauses, supplemented with technical safeguards
        (encryption in transit and at rest).
      </p>

      <h2 id="retention">How long we keep your data</h2>
      <ul>
        <li>
          <strong>Account profile</strong>: while your account is active.
          On account deletion, profile rows are removed within 7 days.
        </li>
        <li>
          <strong>Booking and payment records</strong>: 7 years from the
          end of the relevant tax year, to satisfy UK/US tax and audit
          requirements. Personal identifiers are redacted on account
          deletion; the financial records remain in pseudonymised form.
        </li>
        <li>
          <strong>Background-check status</strong>: retained for the life
          of the caregiver account; redacted on deletion. Underlying
          source documents are held by the vendor (uCheck or Checkr) under
          their own retention rules.
        </li>
        <li>
          <strong>Location pings</strong>: 90 days, then automatically
          deleted. Deleted immediately on account deletion.
        </li>
        <li>
          <strong>Support &amp; security logs</strong>: 12 months.
        </li>
      </ul>

      <h2 id="rights">Your rights</h2>
      <p>
        Under UK and EU data protection law you can:
      </p>
      <ul>
        <li>Access the personal data we hold about you.</li>
        <li>Correct inaccurate or incomplete data.</li>
        <li>
          Erase your data (subject to the retention rules above for
          tax/audit data).
        </li>
        <li>Restrict or object to processing.</li>
        <li>Receive a copy of your data in a portable format.</li>
        <li>Withdraw consent for any consent-based processing.</li>
        <li>
          Lodge a complaint with the UK Information Commissioner&apos;s
          Office at{" "}
          <a href="https://ico.org.uk/make-a-complaint/">
            ico.org.uk/make-a-complaint
          </a>
          .
        </li>
      </ul>
      <p>
        Self-serve account deletion is available at{" "}
        <a href="/account/delete">/account/delete</a>. For other rights,
        email <a href="mailto:privacy@allcare4u.co.uk">privacy@allcare4u.co.uk</a>{" "}
        and we will respond within one calendar month.
      </p>

      <h2 id="ccpa">California (CCPA / CPRA) rights</h2>
      <p>
        If you are a California resident, you have the right to:
      </p>
      <ul>
        <li>
          Know what personal information we collect, use, disclose, and
          retain about you.
        </li>
        <li>Delete personal information.</li>
        <li>Correct inaccurate personal information.</li>
        <li>
          Opt out of the &quot;sale&quot; or &quot;sharing&quot; of personal
          information for cross-context behavioural advertising. We do not
          sell or share for that purpose, and we do not knowingly collect
          personal information from anyone under 16.
        </li>
        <li>Limit the use of sensitive personal information.</li>
        <li>Be free from discrimination for exercising these rights.</li>
      </ul>
      <p>
        To exercise CCPA rights email{" "}
        <a href="mailto:privacy@allcare4u.co.uk">privacy@allcare4u.co.uk</a>{" "}
        with the subject &quot;CCPA request&quot;. We will verify your
        identity by matching the email address on your SpecialCarer account
        and respond within 45 days.
      </p>

      <h2 id="security">Security</h2>
      <ul>
        <li>All traffic to specialcarer.com is encrypted with TLS 1.2+.</li>
        <li>
          Passwords are hashed with bcrypt by Supabase Auth; we never see
          them.
        </li>
        <li>
          Card data is held by Stripe under PCI-DSS Level 1 controls. We
          only see the last four digits.
        </li>
        <li>
          Database access is restricted by row-level security. Internal
          access is audited.
        </li>
        <li>
          We will notify affected users and the ICO within 72 hours of
          becoming aware of a personal data breach that creates a risk to
          your rights.
        </li>
      </ul>

      <h2 id="children">Children</h2>
      <p>
        SpecialCarer is for adults aged 18 and over. We do not knowingly
        collect personal information from anyone under 18. Care recipients
        in a household may be minors, but the booking is always made by an
        adult account-holder. If we discover an account has been created by
        someone under 18 we will delete it.
      </p>

      <h2 id="background-checks">Background checks</h2>
      <p>
        Caregivers must clear a country-specific bundle before they can
        accept paid bookings:
      </p>
      <ul>
        <li>
          <strong>UK</strong>: Enhanced DBS + Children &amp; Adults Barred
          Lists, Right to Work confirmation (IDVT), and Digital Identity
          verification — all delivered via uCheck.
        </li>
        <li>
          <strong>US</strong>: County &amp; federal criminal history,
          OIG/SAM healthcare-sanctions screening, and (where applicable) a
          Motor Vehicle Report — delivered via Checkr.
        </li>
      </ul>
      <p>
        SpecialCarer pays the vendor fee directly. Caregivers consent to
        the check before submission. Vendors retain the underlying
        certificate copies under their own data policies; we receive only
        the result code, certificate number, and a clearance status.
      </p>

      <h2 id="location">Location data — important detail</h2>
      <p>
        Live caregiver location is one of the most sensitive things we
        process. Our rules:
      </p>
      <ul>
        <li>
          We collect it only while a paid booking is in its scheduled
          window. Server-side checks reject any ping outside that window.
        </li>
        <li>
          The caregiver explicitly taps &quot;Start sharing my location&quot;
          on the booking screen. They can stop at any time.
        </li>
        <li>
          On Android the foreground notification stays visible while
          tracking is on — you always know it&apos;s running.
        </li>
        <li>
          Location data is visible only to the caregiver and the booking
          family. It is never shown to the public or used for marketing.
        </li>
        <li>Pings are deleted after 90 days, or immediately on account deletion.</li>
      </ul>

      <h2 id="cookies">Cookies &amp; tracking</h2>
      <p>
        We use a small number of strictly-necessary cookies for sign-in
        sessions, security, and load-balancing. Non-essential cookies (for
        anonymous analytics) are only set with your consent — see our{" "}
        <a href="/cookies">cookie notice</a> for the full list and
        controls.
      </p>

      <h2 id="changes">Changes to this policy</h2>
      <p>
        We will post any material changes here and bump the &quot;last
        updated&quot; date. For changes that affect your rights, we will
        notify account holders by email at least 14 days before the change
        takes effect.
      </p>

      <h2 id="contact">Contact us</h2>
      <p>
        Privacy queries:{" "}
        <a href="mailto:privacy@allcare4u.co.uk">privacy@allcare4u.co.uk</a>
        <br />
        General office:{" "}
        <a href="mailto:office@allcare4u.co.uk">office@allcare4u.co.uk</a>
        <br />
        Post: All Care 4 U Group Limited, 85 Great Portland Street,
        London, England, W1W 7LT
      </p>
    </LegalLayout>
  );
}
