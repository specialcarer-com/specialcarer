import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** GET /api/m/blockouts — list authenticated carer's block-out dates */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("caregiver_blockouts")
    .select("id, starts_on, ends_on, reason, created_at")
    .eq("user_id", user.id)
    .gte("ends_on", new Date().toISOString().slice(0, 10))
    .order("starts_on");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ blockouts: data ?? [] });
}

/**
 * POST /api/m/blockouts
 * Body: { starts_on: string (YYYY-MM-DD), ends_on: string, reason?: string }
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { starts_on: string; ends_on: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { starts_on, ends_on, reason } = body;
  if (!starts_on || !ends_on) {
    return NextResponse.json(
      { error: "starts_on and ends_on are required" },
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
    .from("caregiver_blockouts")
    .insert({ user_id: user.id, starts_on, ends_on, reason: reason ?? null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ blockout: data }, { status: 201 });
}
