import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublicToken, getStyle } from "@/lib/mapbox/server";
import JobsShellClient from "./JobsShellClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Jobs — SpecialCarer" };

/**
 * Carer-side jobs shell. Server component requires auth and caregiver role.
 * Determines whether to default to "my-work" or "find-work" based on
 * whether the carer has any booking activity.
 */
export default async function JobsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/jobs");

  // Determine default mode: my-work if carer has any booking activity
  let defaultMode: "my-work" | "find-work" = "find-work";
  try {
    const now = new Date().toISOString();
    // Quick count — any bookings at all as caregiver
    const { count } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .or(`caregiver_id.eq.${user.id},preferred_carer_id.eq.${user.id}`)
      .or(`offer_expires_at.is.null,offer_expires_at.gt.${now}`)
      .limit(1);
    if ((count ?? 0) > 0) {
      defaultMode = "my-work";
    }
  } catch {
    // best-effort; fall back to find-work
  }

  return (
    <JobsShellClient
      mapboxToken={getPublicToken()}
      mapStyle={getStyle()}
      defaultMode={defaultMode}
    />
  );
}
