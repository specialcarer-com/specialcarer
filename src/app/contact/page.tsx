import Link from "next/link";
import SiteFooter from "@/components/site-footer";
import Image from "next/image";

export const metadata = {
  title: "Contact — SpecialCarer",
  description:
    "Reach the SpecialCarer team — general support, privacy queries, disputes, press, and legal.",
};

export default function ContactPage() {
  const contacts: Array<{
    label: string;
    email: string;
    blurb: string;
    sla?: string;
  }> = [
    {
      label: "General office",
      email: "office@allcare4u.co.uk",
      blurb:
        "Anything that isn't covered by one of the more specific addresses below.",
      sla: "We aim to reply within 1 working day.",
    },
    {
      label: "Customer support",
      email: "support@allcare4u.co.uk",
      blurb:
        "Questions about a booking, your account, payments, or background-check status.",
      sla: "Within 24 hours, 7 days a week.",
    },
    {
      label: "Disputes",
      email: "disputes@allcare4u.co.uk",
      blurb:
        "Refund requests, no-shows, conduct issues. Please include the booking ID.",
      sla: "Initial acknowledgement within 24h; resolution within 14 days.",
    },
    {
      label: "Privacy & data rights",
      email: "privacy@allcare4u.co.uk",
      blurb:
        "Subject access requests, data deletion (you can also self-serve at /account/delete), and ICO/CCPA queries.",
      sla: "Within 30 days, as required by UK GDPR.",
    },
    {
      label: "Legal",
      email: "legal@allcare4u.co.uk",
      blurb:
        "Contracts, formal notices, regulator correspondence, IP claims.",
    },
    {
      label: "Press",
      email: "press@allcare4u.co.uk",
      blurb:
        "Media enquiries, partnership requests, interview bookings.",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="px-6 py-5 border-b border-slate-100">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/brand/logo.svg" alt="SpecialCarer" width={161} height={121} className="h-9 w-auto" priority />
          </Link>
          <nav className="flex items-center gap-5 text-sm text-slate-600">
            <Link href="/privacy" className="hover:text-slate-900">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-slate-900">
              Terms
            </Link>
            <Link href="/cookies" className="hover:text-slate-900">
              Cookies
            </Link>
            <Link href="/contact" className="text-slate-900 font-medium">
              Contact
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 px-6 py-12">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Contact us
          </h1>
          <p className="mt-3 text-slate-600">
            We respond to every email a human sends us. Pick the address
            below that best matches what you need — it gets your message to
            the right team faster.
          </p>

          <div className="mt-8 grid sm:grid-cols-2 gap-4">
            {contacts.map((c) => (
              <a
                key={c.email}
                href={`mailto:${c.email}`}
                className="block p-5 rounded-2xl border border-slate-200 hover:border-brand transition bg-white"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-slate-900">{c.label}</h2>
                  <span className="text-xs text-brand">→</span>
                </div>
                <p className="mt-2 text-sm text-brand font-medium">
                  {c.email}
                </p>
                <p className="mt-2 text-sm text-slate-600">{c.blurb}</p>
                {c.sla && (
                  <p className="mt-2 text-xs text-slate-500">{c.sla}</p>
                )}
              </a>
            ))}
          </div>

          <div className="mt-10 p-5 rounded-2xl bg-slate-50">
            <h2 className="font-semibold">Postal address</h2>
            <p className="mt-2 text-sm text-slate-700">
              All Care 4 U Group Limited
              <br />
              85 Great Portland Street
              <br />
              London, England W1W 7LT
              <br />
              United Kingdom
            </p>
            <p className="mt-3 text-xs text-slate-500">
              Registered in England &amp; Wales · Company number 09428739
            </p>
          </div>

          <div className="mt-6 p-5 rounded-2xl border border-slate-200">
            <h2 className="font-semibold">In an emergency</h2>
            <p className="mt-2 text-sm text-slate-700">
              If you or someone you care for is in immediate danger, call{" "}
              <span className="font-medium">999 (UK)</span> or{" "}
              <span className="font-medium">911 (US)</span>. SpecialCarer
              support is not staffed for emergencies.
            </p>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
