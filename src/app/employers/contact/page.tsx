import type { Metadata } from "next";
import MarketingShell from "@/components/marketing-shell";

export const metadata: Metadata = {
  title: "Talk to our employer team — SpecialCarer",
  description:
    "Tell us about your team and we'll come back within one business day with a tailored proposal.",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  return (
    <MarketingShell>
      <section className="px-6 py-16 sm:py-20 max-w-3xl mx-auto">
        <span className="inline-block px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">
          For employers
        </span>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900">
          Tell us about your team.
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          We&rsquo;ll come back within one business day with a tailored
          proposal — no sales-y nonsense, just a useful conversation.
        </p>

        {status === "success" && (
          <div className="mt-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-900">
            Thanks — we&rsquo;ve got your details and someone from our team will
            be in touch within one business day.
          </div>
        )}
        {status === "error" && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-900">
            Something went wrong submitting that form. Please email{" "}
            <a
              href="mailto:employers@specialcarer.com"
              className="underline"
            >
              employers@specialcarer.com
            </a>{" "}
            instead.
          </div>
        )}
        {(status === "missing" ||
          status === "invalid_email" ||
          status === "invalid_country") && (
          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
            Please double-check the form — some fields look incomplete or
            invalid.
          </div>
        )}
        {status === "rate_limited" && (
          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
            You’ve submitted this form a few times in the last hour. Please
            wait a little while before trying again, or email{" "}
            <a
              href="mailto:employers@specialcarer.com"
              className="underline"
            >
              employers@specialcarer.com
            </a>{" "}
            directly.
          </div>
        )}

        <form
          method="post"
          action="/api/employers/lead"
          className="mt-10 grid sm:grid-cols-2 gap-5"
        >
          <label className="text-sm">
            <span className="text-slate-700 font-medium">Company *</span>
            <input
              type="text"
              name="company_name"
              required
              maxLength={120}
              className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-700 font-medium">Your name *</span>
            <input
              type="text"
              name="contact_name"
              required
              maxLength={120}
              className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-700 font-medium">Work email *</span>
            <input
              type="email"
              name="work_email"
              required
              maxLength={200}
              className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-700 font-medium">Phone (optional)</span>
            <input
              type="tel"
              name="phone"
              maxLength={40}
              className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-700 font-medium">
              Where is your team? *
            </span>
            <select
              name="country"
              required
              defaultValue="UK"
              className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="UK">United Kingdom</option>
              <option value="US">United States</option>
              <option value="OTHER">UK + US / global</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-700 font-medium">Employee count</span>
            <select
              name="employee_count"
              defaultValue=""
              className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="">Select…</option>
              <option value="1-50">1–50</option>
              <option value="51-250">51–250</option>
              <option value="251-1000">251–1,000</option>
              <option value="1000+">1,000+</option>
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-slate-700 font-medium">
              What problem are you trying to solve?
            </span>
            <select
              name="use_case"
              defaultValue=""
              className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="">Select…</option>
              <option value="absenteeism">Reduce care-related absenteeism</option>
              <option value="retention">
                Improve parent / carer retention
              </option>
              <option value="benefits">
                Add care to our benefits package
              </option>
              <option value="dei">DEI / inclusion strategy</option>
              <option value="other">Something else</option>
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-slate-700 font-medium">
              Anything else we should know?
            </span>
            <textarea
              name="message"
              rows={4}
              maxLength={2000}
              className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </label>
          <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center gap-4">
            <button
              type="submit"
              className="px-6 py-3 rounded-xl bg-brand text-white font-medium hover:bg-brand-600 transition"
            >
              Send my details
            </button>
            <p className="text-xs text-slate-500">
              By submitting, you agree to our privacy policy. We&rsquo;ll only
              use your details to respond to this enquiry.
            </p>
          </div>
        </form>
      </section>
    </MarketingShell>
  );
}
