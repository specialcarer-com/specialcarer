import Link from "next/link";
import RegShell from "../_components/RegShell";

export default function Step9() {
  return (
    <RegShell step={9} title="Pending verification">
      <div className="rounded-card bg-white border border-line p-5 text-center">
        <div className="text-[44px]" aria-hidden>
          📨
        </div>
        <p className="mt-2 text-[16px] font-bold text-heading">
          Submission received
        </p>
        <p className="mt-1 text-[13px] text-subheading">
          We aim to verify within 2 business days. We&rsquo;ll email the
          booker as soon as we&rsquo;re done. In the meantime, browse and
          shortlist carers — booking unlocks the moment you&rsquo;re
          verified.
        </p>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Link
          href="/m/org/carers"
          className="rounded-card border border-line bg-white p-3 text-center text-[13px] font-semibold text-heading"
        >
          Browse carers
        </Link>
        <Link
          href="/m/org"
          className="rounded-card bg-primary p-3 text-center text-[13px] font-semibold text-white"
        >
          Go to dashboard
        </Link>
      </div>
    </RegShell>
  );
}
