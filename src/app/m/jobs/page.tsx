import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublicToken, getStyle } from "@/lib/mapbox/server";
import JobsFeedClient from "./JobsFeedClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Jobs near you — SpecialCarer" };

/**
 * Carer-side job discovery feed. Server component is just a thin
 * shell — it requires auth and forwards the Mapbox token from the
 * server env to the client component. All data fetching, filtering
 * and the Map/List toggle live in JobsFeedClient.
 */
export default async function JobsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/jobs");

  return (
    <JobsFeedClient mapboxToken={getPublicToken()} mapStyle={getStyle()} />
  );
}
