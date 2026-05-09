import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "../../_components/ui";
import ReferralsClient from "./ReferralsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Referrals — SpecialCarer" };

export default async function ReferralsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/earnings/referrals");
  return (
    <div className="min-h-screen bg-bg-screen">
      <TopBar title="Referrals" back="/m/earnings" />
      <ReferralsClient />
    </div>
  );
}
