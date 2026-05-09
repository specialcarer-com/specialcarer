import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "../../_components/ui";
import TaxClient from "./TaxClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tax exports — SpecialCarer" };

export default async function TaxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/earnings/tax");
  return (
    <div className="min-h-screen bg-bg-screen">
      <TopBar title="Tax & exports" back="/m/earnings" />
      <TaxClient />
    </div>
  );
}
