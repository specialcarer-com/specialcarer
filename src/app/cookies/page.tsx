import LegalLayout, { type LegalSection } from "@/components/legal-layout";
import LegalTable, {
  THead,
  TH,
  TBody,
  TR,
  TD,
} from "@/components/legal-table";

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
      updated="25 June 2026"
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
      <LegalTable>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Set by</TH>
            <TH>Purpose</TH>
            <TH>Lifetime</TH>
          </TR>
        </THead>
        <TBody>
          <TR>
            <TD>Authentication tokens</TD>
            <TD>specialcarers.com</TD>
            <TD>Keeps you signed in</TD>
            <TD>Session / 7 days</TD>
          </TR>
          <TR>
            <TD>__stripe_mid, __stripe_sid</TD>
            <TD>js.stripe.com</TD>
            <TD>Stripe fraud prevention on the checkout flow</TD>
            <TD>Session / 1 year</TD>
          </TR>
          <TR>
            <TD>sc_csrf</TD>
            <TD>specialcarers.com</TD>
            <TD>CSRF protection on form submissions</TD>
            <TD>Session</TD>
          </TR>
          <TR>
            <TD>sc_consent</TD>
            <TD>specialcarers.com</TD>
            <TD>Remembers your cookie-consent choice</TD>
            <TD>1 year</TD>
          </TR>
        </TBody>
      </LegalTable>

      <h2 id="analytics">Analytics cookies (consent required)</h2>
      <p>
        With your consent we collect aggregated, anonymised metrics about
        which features are used. We do not use this data to build a
        profile of you and we do not share it with advertisers.
      </p>
      <LegalTable>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Set by</TH>
            <TH>Purpose</TH>
            <TH>Lifetime</TH>
          </TR>
        </THead>
        <TBody>
          <TR>
            <TD>sc_anon</TD>
            <TD>specialcarers.com</TD>
            <TD>
              Anonymous device identifier for product analytics
              (page views, conversion funnel). No name, email, or IP is
              attached.
            </TD>
            <TD>13 months</TD>
          </TR>
        </TBody>
      </LegalTable>
      <p className="text-sm text-slate-500">
        We may add a third-party analytics provider in future (such as
        PostHog or Plausible). When we do, we will update this table and
        re-prompt for consent before any new cookie is set.
      </p>

      <h2 id="control">How to control cookies</h2>
      <ul>
        <li>
          When you first visit specialcarers.com you will see a banner
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
