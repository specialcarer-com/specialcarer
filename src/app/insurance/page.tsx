import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/components/marketing-shell";
import { getSupportConfig } from "@/lib/support/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Insurance — SpecialCarer",
  description:
    "Insurance summary for SpecialCarer / All Care 4 U Group Ltd. UK and US cover, with recommendations for independent carers.",
};

export default async function InsurancePage() {
  const cfg = await getSupportConfig();
  const md =
    cfg.insurance_summary_md && cfg.insurance_summary_md.trim().length > 0
      ? cfg.insurance_summary_md
      : "Insurance summary will appear here once published.";

  return (
    <MarketingShell>
      <article className="max-w-3xl mx-auto px-6 py-12">
        <p className="text-sm text-slate-500">
          <Link href="/" className="hover:text-slate-700">
            Home
          </Link>{" "}
          ›{" "}
          <Link href="/trust" className="hover:text-slate-700">
            Trust &amp; Safety
          </Link>{" "}
          › Insurance
        </p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">
          Insurance summary
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          For questions about insurance, email{" "}
          <a
            href={`mailto:${cfg.support_email}`}
            className="text-brand-700 hover:underline"
          >
            {cfg.support_email}
          </a>
          .
        </p>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-[15px] text-slate-800 whitespace-pre-wrap leading-relaxed">
            {md}
          </div>
        </section>

        <section className="mt-8 grid sm:grid-cols-2 gap-3">
          <Link
            href="/worker-protection"
            className="block rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-sm"
          >
            <p className="font-semibold text-slate-900">Worker protections</p>
            <p className="mt-1 text-xs text-slate-600">
              Your rights when a shift becomes unsafe, and how to escalate.
            </p>
          </Link>
          <Link
            href="/trust"
            className="block rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-sm"
          >
            <p className="font-semibold text-slate-900">Trust &amp; Safety</p>
            <p className="mt-1 text-xs text-slate-600">
              How we vet, monitor, and resolve disputes.
            </p>
          </Link>
        </section>
      </article>
    </MarketingShell>
  );
}
