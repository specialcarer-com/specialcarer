import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-slate-100 bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-8 text-sm">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-white font-bold">
              S
            </div>
            <span className="font-semibold text-base text-slate-900">
              SpecialCarer
            </span>
          </div>
          <p className="mt-3 text-slate-600">
            On-demand, vetted caregivers for families across the UK and US.
          </p>
        </div>

        <div>
          <h3 className="text-slate-900 font-semibold">Product</h3>
          <ul className="mt-3 space-y-2 text-slate-600">
            <li>
              <Link href="/find-care" className="hover:text-slate-900">
                Find care
              </Link>
            </li>
            <li>
              <Link href="/onboarding" className="hover:text-slate-900">
                Become a caregiver
              </Link>
            </li>
            <li>
              <Link href="/login" className="hover:text-slate-900">
                Sign in
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-slate-900 font-semibold">Company</h3>
          <ul className="mt-3 space-y-2 text-slate-600">
            <li>
              <Link href="/contact" className="hover:text-slate-900">
                Contact
              </Link>
            </li>
            <li>
              <a
                href="mailto:office@allcare4u.co.uk"
                className="hover:text-slate-900"
              >
                office@allcare4u.co.uk
              </a>
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
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-5 text-xs text-slate-500 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p>
            © {new Date().getFullYear()} All Care 4 U Group Limited. Registered
            in England &amp; Wales, company no. 09428739.
          </p>
          <p>
            85 Great Portland Street, London, England, W1W 7LT
          </p>
        </div>
      </div>
    </footer>
  );
}
