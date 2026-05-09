import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "../../_components/ui";
import EmergencyContactsClient from "./EmergencyContactsClient";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  name: string;
  phone: string;
  relationship: string | null;
  sort_order: number;
};

export default async function EmergencyContactsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/m/login?redirect=/m/profile/emergency-contacts");
  }

  const { data } = await supabase
    .from("emergency_contacts")
    .select("id, name, phone, relationship, sort_order")
    .eq("owner_id", user.id)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const contacts = (data ?? []) as Row[];

  return (
    <div className="min-h-screen bg-bg-screen pb-8">
      <TopBar title="Emergency contacts" back="/m/profile" />
      <EmergencyContactsClient initialContacts={contacts} />
    </div>
  );
}
