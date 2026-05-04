import LegalLayout, { type LegalSection } from "@/components/legal-layout";

export const metadata = {
  title: "Terms of Service — SpecialCarer",
  description:
    "The agreement between you and All Care 4 U Group Limited governing your use of SpecialCarer.",
};

const sections: LegalSection[] = [
  { id: "summary", title: "Summary" },
  { id: "agreement", title: "The agreement" },
  { id: "eligibility", title: "Eligibility & accounts" },
  { id: "marketplace", title: "Our role as a marketplace" },
  { id: "caregivers", title: "Caregiver obligations" },
  { id: "families", title: "Family/seeker obligations" },
  { id: "bookings", title: "Bookings, fees & payments" },
  { id: "cancellations", title: "Cancellations & refunds" },
  { id: "background-checks", title: "Background checks" },
  { id: "tracking", title: "Live tracking" },
  { id: "prohibited", title: "Prohibited conduct" },
  { id: "content", title: "Your content" },
  { id: "ip", title: "Intellectual property" },
  { id: "disclaimers", title: "Disclaimers" },
  { id: "liability", title: "Limitation of liability" },
  { id: "indemnity", title: "Indemnity" },
  { id: "termination", title: "Termination" },
  { id: "disputes", title: "Disputes & governing law" },
  { id: "us-terms", title: "Additional US terms" },
  { id: "changes", title: "Changes" },
  { id: "contact", title: "Contact" },
];

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Service"
      updated="3 May 2026"
      sections={sections}
      jurisdictionNote="If you live in the United Kingdom or European Economic Area these terms are governed by the laws of England and Wales. If you live in the United States, see the additional US terms section below."
    >
      <h2 id="summary">Summary</h2>
      <p>
        SpecialCarer is a marketplace operated by All Care 4 U Group
        Limited that connects families needing care with self-employed
        caregivers. We are not the employer of caregivers and we are not a
        party to the care agreement between a family and a caregiver — the
        booking contract is directly between the two of you. We provide
        the platform, the vetting workflow, the payment-processing rails,
        and the tracking tools that make those bookings safer and easier.
      </p>
      <p>
        Please read these terms in full. By creating an account or making a
        booking you agree to them.
      </p>

      <h2 id="agreement">The agreement</h2>
      <p>
        These Terms of Service form a legally binding agreement between
        you and <strong>All Care 4 U Group Limited</strong> (company number
        09428739, registered at 85 Great Portland Street, London, England,
        W1W 7LT). &quot;SpecialCarer&quot;, &quot;we&quot;, &quot;us&quot;
        and &quot;our&quot; refer to that company.
      </p>

      <h2 id="eligibility">Eligibility &amp; accounts</h2>
      <ul>
        <li>You must be at least 18 years old to create an account.</li>
        <li>
          You must provide accurate, current, and complete information and
          keep it up to date.
        </li>
        <li>
          You are responsible for the security of your password and for
          all activity under your account. Notify us immediately at{" "}
          <a href="mailto:office@allcare4u.co.uk">office@allcare4u.co.uk</a>{" "}
          if you suspect unauthorised access.
        </li>
        <li>
          One personal account per person. Caregivers and families may
          hold one account each in either capacity but not multiple.
        </li>
      </ul>

      <h2 id="marketplace">Our role as a marketplace</h2>
      <ul>
        <li>
          Caregivers on SpecialCarer are <strong>self-employed
          independent contractors</strong>, not our employees, agents, or
          partners.
        </li>
        <li>
          Each booking is a direct contract between a caregiver and a
          family. We facilitate the booking and the payment but we are
          not a party to the care that is delivered.
        </li>
        <li>
          We vet caregivers (see <a href="#background-checks">Background
          checks</a>), but we do not warrant the suitability, judgement,
          or behaviour of any individual user. Families remain responsible
          for their own due diligence.
        </li>
      </ul>

      <h2 id="caregivers">If you are a caregiver</h2>
      <ul>
        <li>
          You must complete the country-specific background-check bundle
          before you can accept paid bookings.
        </li>
        <li>
          You must hold all licences, insurance, and immigration permissions
          required to deliver the services you list.
        </li>
        <li>
          You are responsible for your own taxes. In the UK that includes
          self-assessment tax returns and National Insurance contributions.
          In the US, SpecialCarer will issue a Form 1099-NEC where annual
          earnings exceed the IRS threshold; you remain responsible for
          income and self-employment tax filings.
        </li>
        <li>
          Payouts are processed via Stripe Connect. By onboarding to
          payouts you also agree to the{" "}
          <a href="https://stripe.com/connect-account/legal/full">
            Stripe Connected Account Agreement
          </a>
          .
        </li>
        <li>
          Funds are held by SpecialCarer (via Stripe) until the shift is
          complete and a 24-hour review window has passed, at which point
          your share (the booking total minus the platform commission) is
          released to your Stripe Connect account for payout.
        </li>
        <li>
          You must keep accurate records of hours worked and respond
          honestly to any incident review.
        </li>
      </ul>

      <h2 id="families">If you are a family/seeker</h2>
      <ul>
        <li>
          You are responsible for accurately describing the care need,
          the home environment, and any health or safety risks the
          caregiver should know about.
        </li>
        <li>
          You agree to pay the booking total when you book. Payments are
          captured by SpecialCarer (via Stripe) and held until the shift
          is complete.
        </li>
        <li>
          You may dispute a charge within 24 hours of the scheduled shift
          end (see <a href="#cancellations">Cancellations &amp; refunds</a>).
        </li>
        <li>
          You agree not to circumvent the platform — you must not
          arrange or pay for off-platform shifts with a caregiver you met
          on SpecialCarer for at least 12 months after first contact.
        </li>
      </ul>

      <h2 id="bookings">Bookings, fees &amp; payments</h2>
      <ul>
        <li>
          The booking total includes the caregiver&apos;s rate × hours,
          plus our platform commission (currently <strong>30%</strong>).
        </li>
        <li>
          Payment is captured at the time of booking via Stripe.
          SpecialCarer holds the funds until the shift completes plus a
          24-hour review window before releasing the caregiver&apos;s
          share.
        </li>
        <li>
          Currency is GBP for UK bookings and USD for US bookings.
        </li>
        <li>
          Receipts and invoices are available in your dashboard at any
          time.
        </li>
      </ul>

      <h2 id="cancellations">Cancellations &amp; refunds</h2>
      <ul>
        <li>
          <strong>Family-initiated cancellations</strong>:
          <ul>
            <li>More than 24 hours before scheduled start: full refund.</li>
            <li>
              Less than 24 hours before scheduled start: 50% refund (the
              caregiver receives 50% × their share).
            </li>
            <li>
              No-show or after start: no refund except in the
              circumstances below.
            </li>
          </ul>
        </li>
        <li>
          <strong>Caregiver-initiated cancellations</strong>: full refund
          to the family. Repeated late cancellations may result in
          account suspension.
        </li>
        <li>
          <strong>Force majeure</strong>: emergencies (illness, severe
          weather, family bereavement, public-transport disruption that
          made attendance impossible) are reviewed case-by-case and full
          refunds may be granted at our discretion.
        </li>
        <li>
          <strong>Disputes</strong>: contact{" "}
          <a href="mailto:disputes@allcare4u.co.uk">
            disputes@allcare4u.co.uk
          </a>{" "}
          within 24 hours of the scheduled shift end. We may pause the
          payout to the caregiver until the dispute is resolved.
        </li>
      </ul>

      <h2 id="background-checks">Background checks</h2>
      <p>
        Caregivers must clear a country-specific background-check bundle
        before they can accept paid bookings:
      </p>
      <ul>
        <li>
          <strong>UK</strong>: Enhanced DBS + Children &amp; Adults
          Barred Lists, Right to Work, Digital Identity verification.
        </li>
        <li>
          <strong>US</strong>: criminal history (county + federal),
          healthcare-sanctions screening, optional MVR.
        </li>
      </ul>
      <p>
        We pay the vendor fee. The clearance status is shown to families
        on the caregiver profile. A clear background check is a snapshot
        in time and does not guarantee future conduct.
      </p>

      <h2 id="tracking">Live tracking during shifts</h2>
      <p>
        While a shift is in its scheduled window the caregiver may share
        live location with the booking family via the SpecialCarer app.
        This is opt-in for each booking. Tracking is automatically clamped
        to the period from 15 minutes before the scheduled start to 15
        minutes after the scheduled end. See the{" "}
        <a href="/privacy#location">privacy policy</a> for full detail.
      </p>

      <h2 id="prohibited">Prohibited conduct</h2>
      <p>You agree not to:</p>
      <ul>
        <li>
          Use SpecialCarer for any unlawful purpose, including human
          trafficking, exploitation, harassment, or discrimination.
        </li>
        <li>
          Misrepresent your identity, qualifications, immigration status,
          or background.
        </li>
        <li>Bypass safety, payment, or vetting controls.</li>
        <li>
          Solicit payments off-platform from users you met through
          SpecialCarer (see family obligations).
        </li>
        <li>Scrape, copy, or resell platform data.</li>
        <li>
          Upload malware, spam, defamatory content, or content that
          infringes another person&apos;s rights.
        </li>
      </ul>

      <h2 id="content">Your content</h2>
      <p>
        You retain all rights to the content you upload (profile photos,
        bio, messages, reviews). You grant SpecialCarer a worldwide,
        royalty-free, non-exclusive licence to host, display, and
        transmit that content as needed to operate the service.
      </p>

      <h2 id="ip">Intellectual property</h2>
      <p>
        The SpecialCarer name, logo, brand, software, and underlying
        technology are owned by All Care 4 U Group Limited or its
        licensors. Nothing in these Terms grants you ownership of them.
      </p>

      <h2 id="disclaimers">Disclaimers</h2>
      <p>
        The service is provided &quot;as is&quot;. To the fullest extent
        permitted by law, we disclaim all warranties (express or
        implied), including warranties of merchantability, fitness for a
        particular purpose, and non-infringement.
      </p>
      <p>
        Care provided by caregivers is not medical care. SpecialCarer is
        not a healthcare provider, a regulated care agency, an
        employment agency, or an introductory agency under the Conduct
        of Employment Agencies and Employment Businesses Regulations.
      </p>

      <h2 id="liability">Limitation of liability</h2>
      <p>
        Nothing in these Terms limits liability for death or personal
        injury caused by negligence, fraud, or any other liability that
        cannot lawfully be excluded.
      </p>
      <p>
        Subject to that, our total aggregate liability to you in any
        12-month period is limited to the greater of (a) the platform
        commission we collected from you in that period and (b) £100
        (or US$120). We are not liable for indirect or consequential
        loss, lost profits, lost savings, or loss of data.
      </p>

      <h2 id="indemnity">Indemnity</h2>
      <p>
        You agree to indemnify and hold harmless All Care 4 U Group
        Limited and its officers, employees, and processors from claims,
        losses, and expenses arising out of (a) your breach of these
        Terms, (b) your conduct on or off the platform in connection
        with a booking, or (c) your violation of any law or third-party
        right.
      </p>

      <h2 id="termination">Termination</h2>
      <p>
        You can close your account at{" "}
        <a href="/account/delete">/account/delete</a> at any time. We can
        suspend or terminate your account immediately if you breach
        these Terms, if a background check fails, or if continuing to
        host you on the platform would expose other users to material
        risk. Sections that by their nature should survive termination
        (payment obligations, IP, disclaimers, liability,
        indemnity, governing law) will survive.
      </p>

      <h2 id="disputes">Disputes &amp; governing law</h2>
      <p>
        These Terms are governed by the laws of England and Wales. The
        courts of England and Wales have exclusive jurisdiction, except
        that consumer-protection law in your country of residence may
        give you the right to bring proceedings in your local courts.
      </p>
      <p>
        We strongly prefer to resolve disputes informally. Email{" "}
        <a href="mailto:disputes@allcare4u.co.uk">
          disputes@allcare4u.co.uk
        </a>{" "}
        and we will respond within 14 days.
      </p>

      <h2 id="us-terms">Additional US terms</h2>
      <p>
        If you reside in the United States the following also apply:
      </p>
      <ul>
        <li>
          The Federal Arbitration Act governs the interpretation of any
          arbitration clause.
        </li>
        <li>
          You and SpecialCarer agree to resolve disputes arising under
          these Terms by binding arbitration administered by the
          American Arbitration Association under its Consumer Rules,
          except that either party may bring an individual claim in
          small-claims court. <strong>You waive the right to participate
          in a class action.</strong>
        </li>
        <li>
          Arbitration takes place in the venue closest to your residence
          or remotely. SpecialCarer covers AAA filing fees for claims
          under US$10,000.
        </li>
        <li>
          You may opt out of this arbitration provision by emailing{" "}
          <a href="mailto:legal@allcare4u.co.uk">
            legal@allcare4u.co.uk
          </a>{" "}
          within 30 days of creating your account, with the subject
          &quot;Arbitration opt-out&quot;.
        </li>
      </ul>

      <h2 id="changes">Changes to these Terms</h2>
      <p>
        We will post any changes here and bump the &quot;last updated&quot;
        date. For material changes affecting your rights we will give at
        least 14 days&apos; notice by email to active account holders.
        Continued use after the effective date constitutes acceptance.
      </p>

      <h2 id="contact">Contact</h2>
      <p>
        General office:{" "}
        <a href="mailto:office@allcare4u.co.uk">office@allcare4u.co.uk</a>
        <br />
        Legal:{" "}
        <a href="mailto:legal@allcare4u.co.uk">legal@allcare4u.co.uk</a>
        <br />
        Disputes:{" "}
        <a href="mailto:disputes@allcare4u.co.uk">disputes@allcare4u.co.uk</a>
        <br />
        Post: All Care 4 U Group Limited, 85 Great Portland Street,
        London, England, W1W 7LT
      </p>
    </LegalLayout>
  );
}
