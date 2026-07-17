import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar, BottomNav } from "../_components/ui";
import EarningsClient from "./EarningsClient";
import EarningsV1Client from "./EarningsV1Client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Earnings — SpecialCarer" };

export default async function EarningsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/earnings");
  return (
    <div className="min-h-screen bg-bg-screen sc-with-bottom-nav">
      <TopBar title="Earnings" back="/m/profile" />
      <div className="px-5 pt-3">
        <EarningsV1Client />
      </div>
      <EarningsClient />
      <BottomNav active="jobs" role="carer" />
    </div>
  );
}
