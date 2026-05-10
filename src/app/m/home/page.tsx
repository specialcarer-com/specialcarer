import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SeekerHomeClient from "./SeekerHomeClient";
import CarerHomeClient from "./CarerHomeClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home — SpecialCarer" };

/**
 * /m/home — Mobile home tab.
 *
 * Branches by role:
 *   • caregiver → CarerHomeClient (dashboard: earnings, next shift, jobs, etc.)
 *   • seeker / admin / unknown → SeekerHomeClient (existing welcome surface)
 *
 * Done server-side so the carer dashboard renders immediately on first paint
 * instead of flashing seeker content while role is fetched.
 */
export default async function HomeRouter() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/home");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "caregiver") {
    return <CarerHomeClient />;
  }
  return <SeekerHomeClient />;
}
