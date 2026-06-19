import Link from "next/link";

/**
 * Closing call to action. Pure Server Component.
 */
export default function FinalCtaSection() {
  return (
    <section className="bg-[#0F1416]">
      <div className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Only 100 Founder places. Claim yours.
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-white/70">
          Lock in £4.99/month for life and help shape the future of care in the
          UK. When the places are gone, they are gone.
        </p>
        <div className="mt-10">
          <Link
            href="/become-a-caregiver"
            className="inline-flex items-center justify-center rounded-[12px] bg-[#F4A261] px-10 py-4 text-base font-semibold text-[#0F1416] shadow-sm transition hover:bg-[#F4A261]/90 focus:outline-none focus:ring-2 focus:ring-[#F4A261] focus:ring-offset-2 focus:ring-offset-[#0F1416]"
          >
            Become a founding carer
          </Link>
        </div>
        <p className="mt-6 text-sm text-white/50">
          No long-term contract · Cancel anytime
        </p>
      </div>
    </section>
  );
}
