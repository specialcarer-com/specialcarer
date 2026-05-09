import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupportConfig } from "@/lib/support/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Support & Safety — SpecialCarer" };

export default async function SupportHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/support");

  const cfg = await getSupportConfig();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Support &amp; safety
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Talk to a real person. Our hotline runs {cfg.hotline_hours}.
        </p>
      </div>

      <section className="grid sm:grid-cols-2 gap-4">
        <a
          href={`tel:${cfg.hotline_phone_uk.replace(/\s+/g, "")}`}
          className="rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-sm transition"
        >
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
            UK hotline
          </p>
          <p className="mt-1 text-xl font-bold text-slate-900">
            {cfg.hotline_phone_uk}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            For non-emergency support. Dial 999 for life-threatening emergencies.
          </p>
        </a>
        <a
          href={`tel:${cfg.hotline_phone_us.replace(/\s+/g, "")}`}
          className="rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-sm transition"
        >
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
            US hotline
          </p>
          <p className="mt-1 text-xl font-bold text-slate-900">
            {cfg.hotline_phone_us}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            For non-emergency support. Dial 911 for life-threatening emergencies.
          </p>
        </a>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-2">
        <p className="text-sm">
          <span className="font-semibold text-slate-900">Email:</span>{" "}
          <a
            href={`mailto:${cfg.support_email}`}
            className="text-teal-700 hover:underline"
          >
            {cfg.support_email}
          </a>
        </p>
        {cfg.chat_enabled && cfg.chat_url && (
          <p className="text-sm">
            <span className="font-semibold text-slate-900">Live chat:</span>{" "}
            <a
              href={cfg.chat_url}
              target="_blank"
              rel="noreferrer"
              className="text-teal-700 hover:underline"
            >
              Open chat →
            </a>
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
        <p className="text-sm font-semibold text-rose-900">
          Are you in immediate danger?
        </p>
        <p className="text-sm text-rose-800 mt-1">
          Call <strong>999</strong> (UK) or <strong>911</strong> (US). Then use
          in-app SOS, or contact us once you&rsquo;re safe.
        </p>
      </section>

      <section className="grid sm:grid-cols-2 gap-3">
        <Link
          href="/dashboard/community"
          className="rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-sm"
        >
          <p className="font-semibold text-slate-900">Carer community</p>
          <p className="text-xs text-slate-600 mt-1">
            Tips, stories, and peer support from verified carers.
          </p>
        </Link>
        <Link
          href="/insurance"
          className="rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-sm"
        >
          <p className="font-semibold text-slate-900">Insurance summary</p>
          <p className="text-xs text-slate-600 mt-1">
            Liability, indemnity, and what you&rsquo;re recommended to carry.
          </p>
        </Link>
        <Link
          href="/worker-protection"
          className="rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-sm"
        >
          <p className="font-semibold text-slate-900">Worker protections</p>
          <p className="text-xs text-slate-600 mt-1">
            Your rights when a shift becomes unsafe, and how to escalate.
          </p>
        </Link>
        <Link
          href="/dashboard/support/reports"
          className="rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-sm"
        >
          <p className="font-semibold text-slate-900">My reports</p>
          <p className="text-xs text-slate-600 mt-1">
            Track the status of safety reports you&rsquo;ve filed.
          </p>
        </Link>
      </section>
    </div>
  );
}
