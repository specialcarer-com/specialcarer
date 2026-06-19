import Link from "next/link";

/**
 * Founder pricing card. Highlights the £4.99/mo locked-for-life rate vs the
 * standard price. Pure Server Component — checkout wiring lands in a later PR.
 */

const founderIncludes = [
  "£4.99/month, locked for life",
  "First 100 carers only",
  "Founding-carer profile badge",
  "Priority founder support",
  "Flat 30% platform fee — no hidden costs",
  "Cancel anytime",
];

export default function PricingSection() {
  return (
    <section id="pricing" className="bg-[#F4EFE6]">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-[#0F1416] sm:text-4xl">
            The Founder rate
          </h2>
          <p className="mt-4 text-lg text-[#0F1416]/70">
            Reserved for the first 100 carers to join. Once they are gone, the
            price goes up — but yours never will.
          </p>
        </div>

        <div className="mt-12 overflow-hidden rounded-[16px] border-2 border-[#039EA0] bg-white shadow-sm">
          <div className="bg-[#039EA0] px-8 py-4 text-center text-sm font-semibold uppercase tracking-wide text-white">
            Founding carer
          </div>
          <div className="px-8 py-10 text-center">
            <p className="flex items-baseline justify-center gap-1">
              <span className="text-5xl font-extrabold text-[#0F1416]">
                £4.99
              </span>
              <span className="text-lg text-[#0F1416]/60">/month</span>
            </p>
            <p className="mt-2 text-sm font-medium text-[#F4A261]">
              Locked for life · standard rate will be higher
            </p>

            <ul className="mx-auto mt-8 max-w-sm space-y-3 text-left">
              {founderIncludes.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 text-[#0F1416]/80"
                >
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#039EA0] text-xs font-bold text-white"
                  >
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            <Link
              href="/become-a-caregiver"
              className="mt-10 inline-flex w-full items-center justify-center rounded-[12px] bg-[#039EA0] px-8 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-[#039EA0]/90 focus:outline-none focus:ring-2 focus:ring-[#039EA0] focus:ring-offset-2"
            >
              Claim your Founder rate
            </Link>
            <p className="mt-4 text-xs text-[#0F1416]/50">
              You will not be charged until you complete verification and go
              live.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
