import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/components/marketing-shell";
import { getSupportConfig } from "@/lib/support/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Worker protections — SpecialCarer",
  description:
    "How SpecialCarer protects independent carers: right to a safe environment, right to leave a shift, anti-retaliation policy, pay protections.",
};

export default async function WorkerProtectionPage() {
  const cfg = await getSupportConfig();
  const md =
    cfg.worker_protection_md && cfg.worker_protection_md.trim().length > 0
      ? cfg.worker_protection_md
      : "Worker protections will appear here once published.";

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
          › Worker protections
        </p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">
          Worker protections
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Hotline: UK {cfg.hotline_phone_uk} · US {cfg.hotline_phone_us} ·
          Email{" "}
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
            href="/insurance"
            className="block rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-sm"
          >
            <p className="font-semibold text-slate-900">Insurance summary</p>
            <p className="mt-1 text-xs text-slate-600">
              UK and US cover, and what we recommend independent carers carry.
            </p>
          </Link>
          <Link
            href="/dashboard/community"
            className="block rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-sm"
          >
            <p className="font-semibold text-slate-900">Carer community</p>
            <p className="mt-1 text-xs text-slate-600">
              Tips, stories, peer support from verified carers.
            </p>
          </Link>
        </section>
      </article>
    </MarketingShell>
  );
}
