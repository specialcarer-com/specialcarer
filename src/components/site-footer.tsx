import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-slate-100 bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-10 grid sm:grid-cols-2 lg:grid-cols-5 gap-8 text-sm">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-white font-bold">
              S
            </div>
            <span className="font-semibold text-base text-slate-900">
              SpecialCarer
            </span>
          </div>
          <p className="mt-3 text-slate-600 max-w-sm">
            On-demand, vetted caregivers for families across the UK and US. A
            product of All Care 4 U Group Limited.
          </p>
          <p className="mt-4 text-xs text-slate-500">
            For care emergencies dial 999 (UK) or 911 (US). Use the in-app SOS
            button for active-shift incidents.
          </p>
        </div>

        <div>
          <h3 className="text-slate-900 font-semibold">Care services</h3>
          <ul className="mt-3 space-y-2 text-slate-600">
            <li>
              <Link
                href="/services/elderly-care"
                className="hover:text-slate-900"
              >
                Elderly care
              </Link>
            </li>
            <li>
              <Link
                href="/services/childcare"
                className="hover:text-slate-900"
              >
                Childcare
              </Link>
            </li>
            <li>
              <Link
                href="/services/special-needs"
                className="hover:text-slate-900"
              >
                Special-needs
              </Link>
            </li>
            <li>
              <Link
                href="/services/postnatal"
                className="hover:text-slate-900"
              >
                Postnatal
              </Link>
            </li>
            <li>
              <Link href="/find-care" className="hover:text-slate-900">
                Find care now
              </Link>
            </li>
            <li>
              <Link href="/care-in" className="hover:text-slate-900">
                Cities
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-slate-900 font-semibold">Company</h3>
          <ul className="mt-3 space-y-2 text-slate-600">
            <li>
              <Link href="/about" className="hover:text-slate-900">
                About
              </Link>
            </li>
            <li>
              <Link href="/trust" className="hover:text-slate-900">
                Trust &amp; safety
              </Link>
            </li>
            <li>
              <Link href="/pricing" className="hover:text-slate-900">
                Pricing
              </Link>
            </li>
            <li>
              <Link href="/employers" className="hover:text-slate-900">
                For employers
              </Link>
            </li>
            <li>
              <Link
                href="/become-a-caregiver"
                className="hover:text-slate-900"
              >
                Become a caregiver
              </Link>
            </li>
            <li>
              <Link href="/blog" className="hover:text-slate-900">
                Blog
              </Link>
            </li>
            <li>
              <Link href="/press" className="hover:text-slate-900">
                Press &amp; media
              </Link>
            </li>
            <li>
              <Link href="/contact" className="hover:text-slate-900">
                Contact
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-slate-900 font-semibold">Legal</h3>
          <ul className="mt-3 space-y-2 text-slate-600">
            <li>
              <Link href="/privacy" className="hover:text-slate-900">
                Privacy policy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="hover:text-slate-900">
                Terms of service
              </Link>
            </li>
            <li>
              <Link href="/cookies" className="hover:text-slate-900">
                Cookie notice
              </Link>
            </li>
            <li>
              <Link href="/account/delete" className="hover:text-slate-900">
                Delete account
              </Link>
            </li>
            <li>
              <a
                href="mailto:privacy@specialcarer.com"
                className="hover:text-slate-900"
              >
                privacy@specialcarer.com
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-5 text-xs text-slate-500 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
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
