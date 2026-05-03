import LegalLayout, { type LegalSection } from "@/components/legal-layout";

export const metadata = {
  title: "Cookie Notice — SpecialCarer",
  description:
    "What cookies SpecialCarer sets on your device and how to control them.",
};

const sections: LegalSection[] = [
  { id: "summary", title: "Summary" },
  { id: "what", title: "What is a cookie?" },
  { id: "essential", title: "Strictly necessary cookies" },
  { id: "analytics", title: "Analytics cookies" },
  { id: "control", title: "How to control cookies" },
  { id: "changes", title: "Changes" },
];

export default function CookiesPage() {
  return (
    <LegalLayout
      title="Cookie Notice"
      updated="3 May 2026"
      sections={sections}
    >
      <h2 id="summary">Summary</h2>
      <p>
        SpecialCarer uses a small number of cookies to keep you signed in
        and to keep the service working safely. We do not run advertising
        cookies and we do not share cookie data with third-party advertisers.
      </p>
      <p>
        We use one optional, anonymised analytics cookie that we only set
        with your consent.
      </p>

      <h2 id="what">What is a cookie?</h2>
      <p>
        A cookie is a small text file stored on your device by your
        browser. We also use closely-related technologies such as local
        storage and session tokens — for simplicity we refer to all of
        them as &quot;cookies&quot; here.
      </p>

      <h2 id="essential">Strictly necessary cookies</h2>
      <p>
        These are required to operate the service. Your consent is not
        required for these under the UK Privacy and Electronic
        Communications Regulations (PECR) or EU ePrivacy Directive.
      </p>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Set by</th>
            <th>Purpose</th>
            <th>Lifetime</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>sb-access-token, sb-refresh-token</td>
            <td>specialcarer.com (via Supabase Auth)</td>
            <td>Keeps you signed in</td>
            <td>Session / 7 days</td>
          </tr>
          <tr>
            <td>__stripe_mid, __stripe_sid</td>
            <td>js.stripe.com</td>
            <td>Stripe fraud prevention on the checkout flow</td>
            <td>Session / 1 year</td>
          </tr>
          <tr>
            <td>sc_csrf</td>
            <td>specialcarer.com</td>
            <td>CSRF protection on form submissions</td>
            <td>Session</td>
          </tr>
          <tr>
            <td>sc_consent</td>
            <td>specialcarer.com</td>
            <td>Remembers your cookie-consent choice</td>
            <td>1 year</td>
          </tr>
        </tbody>
      </table>

      <h2 id="analytics">Analytics cookies (consent required)</h2>
      <p>
        With your consent we collect aggregated, anonymised metrics about
        which features are used. We do not use this data to build a
        profile of you and we do not share it with advertisers.
      </p>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Set by</th>
            <th>Purpose</th>
            <th>Lifetime</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>sc_anon</td>
            <td>specialcarer.com</td>
            <td>
              Anonymous device identifier for product analytics
              (page views, conversion funnel). No name, email, or IP is
              attached.
            </td>
            <td>13 months</td>
          </tr>
        </tbody>
      </table>
      <p className="text-sm text-slate-500">
        We may add a third-party analytics provider in future (such as
        PostHog or Plausible). When we do, we will update this table and
        re-prompt for consent before any new cookie is set.
      </p>

      <h2 id="control">How to control cookies</h2>
      <ul>
        <li>
          When you first visit specialcarer.com you will see a banner
          letting you accept or decline non-essential cookies. You can
          change your choice at any time using the &quot;Cookie settings&quot;
          link in the footer.
        </li>
        <li>
          You can also block or delete cookies in your browser settings.
          Blocking strictly necessary cookies will prevent sign-in and
          payments from working.
        </li>
        <li>
          On iOS and Android the app uses platform identifiers (the
          system advertising ID is <strong>not</strong> read). You can
          revoke notification or location permissions in OS Settings →
          SpecialCarer.
        </li>
      </ul>

      <h2 id="changes">Changes</h2>
      <p>
        We will update this notice if our cookie use changes. Material
        changes will be communicated by an in-app banner at next sign-in.
      </p>
    </LegalLayout>
  );
}
