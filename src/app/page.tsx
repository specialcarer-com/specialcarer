import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="px-6 py-5 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-white font-bold">
            S
          </div>
          <span className="font-semibold text-lg">SpecialCarer</span>
        </div>
        <nav className="hidden sm:flex items-center gap-6 text-sm text-slate-600">
          <a href="#how" className="hover:text-slate-900">How it works</a>
          <a href="#services" className="hover:text-slate-900">Services</a>
          <a href="#trust" className="hover:text-slate-900">Trust &amp; safety</a>
          <a href="#caregivers" className="hover:text-slate-900">For caregivers</a>
        </nav>
        <Link
          href="#waitlist"
          className="px-4 py-2 rounded-full bg-brand text-white text-sm font-medium hover:bg-brand-600 transition"
        >
          Join waitlist
        </Link>
      </header>

      {/* Hero */}
      <section className="px-6 py-20 sm:py-28 max-w-5xl mx-auto text-center">
        <span className="inline-block px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium mb-6">
          Coming soon to the UK and US
        </span>
        <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight text-slate-900">
          Trusted care, on your schedule.
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto">
          On-demand and scheduled childcare, elder care, and home support from
          vetted, background-checked caregivers. Book in minutes. Track, message,
          and pay in one place.
        </p>

        {/* Waitlist CTA */}
        <form
          id="waitlist"
          action="/api/waitlist"
          method="post"
          className="mt-10 flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto"
        >
          <input
            type="email"
            name="email"
            required
            placeholder="you@example.com"
            className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <button
            type="submit"
            className="px-6 py-3 rounded-xl bg-brand text-white font-medium hover:bg-brand-600 transition"
          >
            Get early access
          </button>
        </form>
        <p className="mt-3 text-xs text-slate-500">
          We&rsquo;ll only email you about launch and beta invites. No spam.
        </p>
      </section>

      {/* Services */}
      <section id="services" className="px-6 py-16 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-semibold text-center">One app, three kinds of care</h2>
          <div className="mt-12 grid sm:grid-cols-3 gap-6">
            {[
              {
                title: "Childcare",
                copy: "Babysitters, after-school pickup, tutoring, and special-needs support.",
              },
              {
                title: "Elder care",
                copy: "Companionship, mobility help, medication reminders, respite care.",
              },
              {
                title: "Home support",
                copy: "Light housekeeping, meal prep, errands, pet care, post-surgery help.",
              },
            ].map((s) => (
              <div key={s.title} className="bg-white p-6 rounded-2xl border border-slate-100">
                <h3 className="font-semibold text-lg">{s.title}</h3>
                <p className="mt-2 text-slate-600 text-sm leading-relaxed">{s.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust */}
      <section id="trust" className="px-6 py-16">
        <div className="max-w-5xl mx-auto grid sm:grid-cols-4 gap-6 text-center">
          {[
            { k: "Enhanced DBS", v: "UK background checks" },
            { k: "Checkr verified", v: "US background checks" },
            { k: "ID + selfie", v: "Verified at signup" },
            { k: "24/7 SOS", v: "In-app emergency" },
          ].map((t) => (
            <div key={t.k}>
              <div className="font-semibold text-slate-900">{t.k}</div>
              <div className="mt-1 text-sm text-slate-600">{t.v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto px-6 py-10 border-t border-slate-100 text-sm text-slate-500">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-between gap-3">
          <div>&copy; {new Date().getFullYear()} SpecialCarer. All rights reserved.</div>
          <div className="flex gap-5">
            <a href="#" className="hover:text-slate-700">Privacy</a>
            <a href="#" className="hover:text-slate-700">Terms</a>
            <a href="mailto:hello@specialcarer.com" className="hover:text-slate-700">hello@specialcarer.com</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
