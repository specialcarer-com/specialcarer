import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSupportConfig } from "@/lib/support/config";
import { TopBar } from "../../_components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Worker protections — SpecialCarer" };

export default async function MobileProtectionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/profile/protection");

  const cfg = await getSupportConfig();

  return (
    <div className="min-h-screen bg-bg-screen pb-12">
      <TopBar title="Worker protections" back="/m/profile" />
      <div className="px-5 pt-3 space-y-4">
        <div className="rounded-card bg-white p-4 shadow-card">
          <p className="text-[12px] uppercase tracking-wide text-subheading font-semibold">
            Quick links
          </p>
          <ul className="mt-2 grid grid-cols-1 gap-2 text-[13px]">
            <li>
              <Link href="/m/support" className="text-primary font-semibold">
                → Hotline &amp; email support
              </Link>
            </li>
            <li>
              <Link href="/m/community" className="text-primary font-semibold">
                → Carer community
              </Link>
            </li>
            <li>
              <Link href="/insurance" className="text-primary font-semibold">
                → Insurance summary
              </Link>
            </li>
          </ul>
        </div>

        <article className="rounded-card bg-white p-5 shadow-card">
          <div className="text-[13.5px] text-heading whitespace-pre-wrap leading-relaxed">
            {cfg.worker_protection_md ||
              "Worker protections will appear here once the admin team publishes them."}
          </div>
        </article>
      </div>
    </div>
  );
}
