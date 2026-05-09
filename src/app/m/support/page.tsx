import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupportConfig } from "@/lib/support/config";
import { TopBar } from "../_components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Support & Safety — SpecialCarer" };

export default async function MobileSupportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/support");
  const cfg = await getSupportConfig();

  return (
    <div className="min-h-screen bg-bg-screen pb-12">
      <TopBar title="Support & Safety" back="/m/profile" />
      <div className="px-5 pt-3 space-y-4">
        <p className="text-[12px] text-subheading">
          Hotline runs {cfg.hotline_hours}. For life-threatening emergencies
          dial 999 (UK) or 911 (US) first.
        </p>

        <div className="grid grid-cols-1 gap-3">
          <a
            href={`tel:${cfg.hotline_phone_uk.replace(/\s+/g, "")}`}
            className="block rounded-card bg-white p-4 shadow-card active:bg-muted/40"
          >
            <p className="text-[11px] uppercase tracking-wide text-subheading font-semibold">
              UK hotline
            </p>
            <p className="mt-1 text-[18px] font-bold text-heading">
              {cfg.hotline_phone_uk}
            </p>
          </a>
          <a
            href={`tel:${cfg.hotline_phone_us.replace(/\s+/g, "")}`}
            className="block rounded-card bg-white p-4 shadow-card active:bg-muted/40"
          >
            <p className="text-[11px] uppercase tracking-wide text-subheading font-semibold">
              US hotline
            </p>
            <p className="mt-1 text-[18px] font-bold text-heading">
              {cfg.hotline_phone_us}
            </p>
          </a>
          <a
            href={`mailto:${cfg.support_email}`}
            className="block rounded-card bg-white p-4 shadow-card active:bg-muted/40"
          >
            <p className="text-[11px] uppercase tracking-wide text-subheading font-semibold">
              Email
            </p>
            <p className="mt-1 text-[14px] text-primary font-semibold">
              {cfg.support_email}
            </p>
          </a>
          {cfg.chat_enabled && cfg.chat_url && (
            <a
              href={cfg.chat_url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-card bg-white p-4 shadow-card active:bg-muted/40"
            >
              <p className="text-[11px] uppercase tracking-wide text-subheading font-semibold">
                Live chat
              </p>
              <p className="mt-1 text-[14px] text-primary font-semibold">
                Open chat →
              </p>
            </a>
          )}
        </div>

        <div className="rounded-card border border-rose-200 bg-rose-50 p-4">
          <p className="text-[13px] font-bold text-rose-900">
            In immediate danger?
          </p>
          <p className="mt-1 text-[12.5px] text-rose-800">
            Call 999 (UK) or 911 (US). Then use SOS in the app, or contact us
            once you&rsquo;re safe.
          </p>
        </div>

        <Link
          href="/m/community"
          className="block rounded-card bg-white p-4 shadow-card"
        >
          <p className="text-[14px] font-bold text-heading">Carer community</p>
          <p className="mt-0.5 text-[12px] text-subheading">
            Tips, stories, peer support from verified carers.
          </p>
        </Link>
        <Link
          href="/m/profile/protection"
          className="block rounded-card bg-white p-4 shadow-card"
        >
          <p className="text-[14px] font-bold text-heading">
            Worker protections
          </p>
          <p className="mt-0.5 text-[12px] text-subheading">
            Your rights when a shift becomes unsafe.
          </p>
        </Link>
        <Link
          href="/insurance"
          className="block rounded-card bg-white p-4 shadow-card"
        >
          <p className="text-[14px] font-bold text-heading">Insurance summary</p>
          <p className="mt-0.5 text-[12px] text-subheading">
            What we cover and what you&rsquo;re recommended to carry.
          </p>
        </Link>
      </div>
    </div>
  );
}
