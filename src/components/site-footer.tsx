import Link from "next/link";
import Image from "next/image";
import type { ComponentType, SVGProps } from "react";

type FooterLink = { href: string; label: string; external?: boolean };
type FooterGroup = { id: string; heading: string; links: FooterLink[] };

const CARE_LINKS: FooterLink[] = [
  { href: "/services/elderly-care", label: "Elderly care" },
  { href: "/services/childcare", label: "Childcare" },
  { href: "/services/special-needs", label: "Special-needs" },
  { href: "/services/postnatal", label: "Postnatal" },
  { href: "/care-formats/live-in", label: "Live-in care" },
  { href: "/care-formats/visiting", label: "Visiting care" },
  { href: "/find-care", label: "Find care now" },
  { href: "/care-in", label: "Cities" },
];

const COMPANY_LINKS: FooterLink[] = [
  { href: "/about", label: "About" },
  { href: "/trust", label: "Trust & safety" },
  { href: "/pricing", label: "Pricing" },
  { href: "/employers", label: "For employers" },
  { href: "/become-a-caregiver", label: "Become a caregiver" },
  { href: "/blog", label: "Blog" },
  { href: "/press", label: "Press & media" },
  { href: "/contact", label: "Contact" },
];

const LEGAL_LINKS: FooterLink[] = [
  { href: "/privacy", label: "Privacy policy" },
  { href: "/terms", label: "Terms of service" },
  { href: "/cookies", label: "Cookie notice" },
  { href: "/account/delete", label: "Delete account" },
  { href: "mailto:privacy@specialcarer.com", label: "privacy@specialcarer.com", external: true },
];

const GROUPS: FooterGroup[] = [
  { id: "care", heading: "Care services", links: CARE_LINKS },
  { id: "company", heading: "Company", links: COMPANY_LINKS },
  { id: "legal", heading: "Legal", links: LEGAL_LINKS },
];

function LinkList({ links }: { links: FooterLink[] }) {
  return (
    <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-slate-300 sm:grid-cols-1">
      {links.map((l) =>
        l.external ? (
          <li key={l.href} className="min-w-0">
            <a
              href={l.href}
              className="block truncate hover:text-white transition"
            >
              {l.label}
            </a>
          </li>
        ) : (
          <li key={l.href} className="min-w-0">
            <Link
              href={l.href}
              className="block truncate hover:text-white transition"
            >
              {l.label}
            </Link>
          </li>
        )
      )}
    </ul>
  );
}

type SocialIcon = ComponentType<SVGProps<SVGSVGElement>>;
const InstagramIcon: SocialIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M12 2.16c3.2 0 3.58.012 4.85.07 1.17.054 1.8.246 2.22.41.56.217.96.475 1.38.895.42.42.68.82.9 1.38.16.42.35 1.05.4 2.22.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.24 1.8-.4 2.22-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.05.35-2.22.4-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.24-2.22-.4a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.35-1.05-.4-2.22-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.24-1.8.4-2.22.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.05-.35 2.22-.4 1.27-.06 1.65-.07 4.85-.07ZM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.32 4.14.6a5.93 5.93 0 0 0-2.14 1.4A5.93 5.93 0 0 0 .6 4.14C.32 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.25 2.15.53 2.91a5.93 5.93 0 0 0 1.4 2.14 5.93 5.93 0 0 0 2.14 1.4c.76.28 1.64.47 2.91.53C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.25 2.91-.53a5.93 5.93 0 0 0 2.14-1.4 5.93 5.93 0 0 0 1.4-2.14c.28-.76.47-1.64.53-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.25-2.15-.53-2.91a5.93 5.93 0 0 0-1.4-2.14A5.93 5.93 0 0 0 19.86.6c-.76-.28-1.64-.47-2.91-.53C15.67.01 15.26 0 12 0Zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32Zm0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.4-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88Z" />
  </svg>
);
const FacebookIcon: SocialIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11.02 10.13 11.93v-8.44H7.08v-3.5h3.05V9.42c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.52c-1.49 0-1.96.93-1.96 1.89v2.27h3.33l-.53 3.5h-2.8V24C19.61 23.09 24 18.09 24 12.07Z" />
  </svg>
);
const LinkedInIcon: SocialIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M22.23 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1.77-1.72V1.72C24 .77 23.21 0 22.23 0ZM7.27 20.45H3.65V9h3.62v11.45ZM5.46 7.43a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2Zm14.99 13.02h-3.6v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67h-3.6V9h3.46v1.56h.05c.48-.91 1.66-1.86 3.42-1.86 3.66 0 4.34 2.41 4.34 5.55v6.2Z" />
  </svg>
);
const XIcon: SocialIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.5 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.16 17.52h1.833L7.084 4.126H5.117L17.084 19.77Z" />
  </svg>
);

const SOCIAL_LINKS: { href: string; label: string; Icon: SocialIcon }[] = [
  { href: "https://www.instagram.com/specialcarer", label: "Instagram", Icon: InstagramIcon },
  { href: "https://www.facebook.com/specialcarer", label: "Facebook", Icon: FacebookIcon },
  { href: "https://www.linkedin.com/company/specialcarer", label: "LinkedIn", Icon: LinkedInIcon },
  { href: "https://x.com/specialcarer", label: "X (Twitter)", Icon: XIcon },
];

export default function SiteFooter() {
  return (
    <footer className="bg-brand-600 text-slate-100">
      <div className="max-w-6xl mx-auto px-6 py-12 text-sm">
        {/* Brand block */}
        <div className="max-w-xl">
          <Link
            href="/"
            className="inline-flex items-center bg-white rounded-lg px-3 py-2"
            aria-label="SpecialCarer — home"
          >
            <Image
              src="/brand/logo.svg"
              alt="SpecialCarer"
              width={161}
              height={121}
              className="h-10 w-auto"
            />
          </Link>
          <p className="mt-4 text-slate-200">
            On-demand, vetted caregivers for families across the UK and US. A
            product of All Care 4 U Group Limited.
          </p>
          <p className="mt-4 text-xs text-slate-300">
            For care emergencies dial 999 (UK) or 911 (US). Use the in-app SOS
            button for active-shift incidents.
          </p>

          {/* Social */}
          <ul className="mt-5 flex items-center gap-3">
            {SOCIAL_LINKS.map(({ href, label, Icon }) => (
              <li key={href}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/20 hover:bg-white hover:text-brand-600 transition"
                >
                  <Icon className="h-4 w-4" />
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Link groups — mobile: each group full-width with 2-col list inside;
            tablet+: 3 columns of groups (each list reverts to 1 col). */}
        <div className="mt-10 grid gap-8 sm:grid-cols-3">
          {GROUPS.map((g) => (
            <nav key={g.id} aria-label={g.heading}>
              <h3 className="text-white font-semibold">{g.heading}</h3>
              <LinkList links={g.links} />
            </nav>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-5 text-xs text-slate-300 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p>
            © {new Date().getFullYear()} All Care 4 U Group Limited. Registered
            in England &amp; Wales, company no. 09428739.
          </p>
          <p>85 Great Portland Street, London, England, W1W 7LT</p>
        </div>
      </div>
    </footer>
  );
}
