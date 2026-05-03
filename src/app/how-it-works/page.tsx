import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/components/marketing-shell";

export const metadata: Metadata = {
  title: "How it works — SpecialCarer",
  description:
    "How SpecialCarer matches families to vetted caregivers, handles payments, and supports both sides of every shift.",
};

const seeker = [
  {
    n: "1",
    t: "Tell us what you need",
    c: "Pick the type of care, the dates, and any specifics — special-needs experience, infant-trained, dementia-aware, driving licence required, and so on. Takes about a minute.",
  },
  {
    n: "2",
    t: "We surface matched caregivers",
    c: "We rank caregivers by match score: relevant experience, distance, availability, response rate, and reviews from families like yours.",
  },
  {
    n: "3",
    t: "Message before you book",
    c: "Chat through the platform to ask questions and confirm fit. Phone numbers stay private until you choose to share.",
  },
  {
    n: "4",
    t: "Book and pay securely",
    c: "Confirm the shift. We authorise the payment and hold it in escrow until 24 hours after the shift ends — so you have a window to flag any issues before the caregiver is paid.",
  },
  {
    n: "5",
    t: "Track the shift live",
    c: "When the shift starts, see the caregiver's live location for the booking window. Use SOS if anything feels off.",
  },
  {
    n: "6",
    t: "Leave a review",
    c: "Both you and the caregiver review each other. Honest reviews keep the marketplace safe.",
  },
];

const caregiver = [
  {
    n: "1",
    t: "Apply with your details",
    c: "Tell us about your experience, certifications, and availability. We'll prompt you for any documents that increase your match rate (paediatric first aid, manual handling, training certs).",
  },
  {
    n: "2",
    t: "Verify your identity",
    c: "ID + selfie, phone number, and address. Takes about 5 minutes.",
  },
  {
    n: "3",
    t: "Pass your background check",
    c: "Enhanced DBS in the UK (via uCheck) or Checkr in the US. We pay for the first check; subsequent re-checks are at our cost too.",
  },
  {
    n: "4",
    t: "Set your rates and availability",
    c: "You set your own hourly rate. Block out times you can't work. Get notified when matched bookings come in.",
  },
  {
    n: "5",
    t: "Accept shifts and get paid",
    c: "Accept the bookings that work for you. Stripe Connect deposits earnings to your bank within 24 hours of shift completion. You keep 80%.",
  },
  {
    n: "6",
    t: "Build your rating",
    c: "Reviews and repeat-booking rate boost your visibility. Top-rated caregivers get earlier access to high-value bookings and B2B contracts.",
  },
];

export default function Page() {
  return (
    <MarketingShell>
      <section className="px-6 py-16 sm:py-24 max-w-4xl mx-auto">
        <span className="inline-block px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">
          How it works
        </span>
        <h1 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900">
          A few taps for families. A real career for caregivers.
        </h1>
        <p className="mt-6 text-lg text-slate-600 leading-relaxed">
          Same platform, two sides. Here&rsquo;s the full workflow for both.
        </p>
      </section>

      <section className="px-6 py-12 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">
            For families
          </h2>
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {seeker.map((s) => (
              <div
                key={s.n}
                className="bg-white p-6 rounded-2xl border border-slate-100"
              >
                <div className="w-9 h-9 rounded-full bg-brand text-white flex items-center justify-center font-semibold">
                  {s.n}
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">{s.t}</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  {s.c}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/find-care"
              className="px-6 py-3 rounded-xl bg-brand text-white font-medium hover:bg-brand-600 transition inline-block"
            >
              Find care
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 py-12">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">
            For caregivers
          </h2>
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {caregiver.map((s) => (
              <div
                key={s.n}
                className="bg-slate-50 p-6 rounded-2xl border border-slate-100"
              >
                <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center font-semibold">
                  {s.n}
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">{s.t}</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  {s.c}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/become-a-caregiver"
              className="px-6 py-3 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 transition inline-block"
            >
              Apply to caregive
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
