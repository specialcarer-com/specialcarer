import Link from "next/link";

/**
 * Founder spot card. Highlights the free founding-carer cohort and what is
 * included. Pure Server Component.
 */

const founderIncludes = [
  "Free to join — no subscription",
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
            The Founding 100
          </h2>
          <p className="mt-4 text-lg text-[#0F1416]/70">
            Reserved for the first 100 carers to join. Free to join while spots
            remain. Once they are gone, they are gone.
          </p>
        </div>

        <div className="mt-12 overflow-hidden rounded-[16px] border-2 border-[#039EA0] bg-white shadow-sm">
          <div className="bg-[#039EA0] px-8 py-4 text-center text-sm font-semibold uppercase tracking-wide text-white">
            Founding carer
          </div>
          <div className="px-8 py-10 text-center">
            <p className="flex items-baseline justify-center gap-1">
              <span className="text-5xl font-extrabold text-[#0F1416]">
                Free
              </span>
              <span className="text-lg text-[#0F1416]/60">to join</span>
            </p>
            <p className="mt-2 text-sm font-medium text-[#F4A261]">
              First 100 carers · limited spots
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
              Claim your founder spot
            </Link>
            <p className="mt-4 text-xs text-[#0F1416]/50">
              No card required to sign up. Platform fee only applies once you
              complete a booking.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
