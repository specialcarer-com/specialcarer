import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "../../_components/ui";
import PayoutClient from "./PayoutClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cash out — SpecialCarer" };

export default async function PayoutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/earnings/payout");
  return (
    <div className="min-h-screen bg-bg-screen">
      <TopBar title="Cash out" back="/m/earnings" />
      <PayoutClient />
    </div>
  );
}
