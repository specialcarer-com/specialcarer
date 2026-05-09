import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("service_requests")
    .select(
      "id, service_type, starts_at, ends_at, hours, hourly_rate_cents, currency, location_city, location_country, status, expires_at, claimed_by, claimed_at, booking_id, created_at",
    )
    .eq("seeker_id", user.id)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ requests: data ?? [] });
}
