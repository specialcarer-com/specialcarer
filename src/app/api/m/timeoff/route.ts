import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** GET /api/m/timeoff — list the authenticated carer's time-off requests */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("caregiver_timeoff_requests")
    .select("id, starts_on, ends_on, reason, status, review_note, reviewed_at, created_at")
    .eq("user_id", user.id)
    .order("starts_on", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ requests: data ?? [] });
}

/**
 * POST /api/m/timeoff
 * Body: { starts_on: string, ends_on: string, reason: string }
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { starts_on: string; ends_on: string; reason: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { starts_on, ends_on, reason } = body;
  if (!starts_on || !ends_on || !reason) {
    return NextResponse.json(
      { error: "starts_on, ends_on and reason are required" },
      { status: 400 }
    );
  }
  if (ends_on < starts_on) {
    return NextResponse.json(
      { error: "ends_on must be >= starts_on" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("caregiver_timeoff_requests")
    .insert({ user_id: user.id, starts_on, ends_on, reason, status: "pending" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ request: data }, { status: 201 });
}
