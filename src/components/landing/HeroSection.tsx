import Link from "next/link";

/**
 * Founding-carer hero. Targets UK carers with the £4.99/mo Founder rate.
 * Pure Server Component — no client-side interactivity.
 */
export default function HeroSection() {
  return (
    <section className="bg-[#F4EFE6]">
      <div className="mx-auto max-w-5xl px-6 py-20 text-center sm:py-28">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#039EA0]/10 px-4 py-1.5 text-sm font-semibold text-[#039EA0]">
          For the first 100 carers
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight text-[#0F1416] sm:text-5xl md:text-6xl">
          Be a founding carer on SpecialCarer
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-[#0F1416]/80 sm:text-xl">
          Build your care business on your own terms. Set your hours, choose
          your families, and keep more of what you earn — with a Founder rate
          locked in for life.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="#pricing"
            className="inline-flex items-center justify-center rounded-[12px] bg-[#039EA0] px-8 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-[#028688] focus:outline-none focus:ring-2 focus:ring-[#039EA0] focus:ring-offset-2"
          >
            Claim your Founder rate
          </Link>
          <Link
            href="#how-it-works"
            className="inline-flex items-center justify-center rounded-[12px] border-2 border-[#039EA0] px-8 py-4 text-base font-semibold text-[#039EA0] transition hover:bg-[#039EA0]/5 focus:outline-none focus:ring-2 focus:ring-[#039EA0] focus:ring-offset-2"
          >
            See how it works
          </Link>
        </div>
        <p className="mt-6 text-sm text-[#0F1416]/60">
          £4.99/month, locked for life · No long-term contract · Cancel anytime
        </p>
      </div>
    </section>
  );
}
