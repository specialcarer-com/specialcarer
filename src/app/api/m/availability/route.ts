import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** GET /api/m/availability — list the authenticated carer's availability slots */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("caregiver_availability_slots")
    .select("id, weekday, start_time, end_time")
    .eq("user_id", user.id)
    .order("weekday")
    .order("start_time");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ slots: data ?? [] });
}

/**
 * PUT /api/m/availability
 * Body: { weekday: 0-6, slots: Array<{ start_time: string; end_time: string }> }
 * Replaces all slots for the given weekday with the provided set.
 * Empty slots array = clears the day (marks inactive).
 */
export async function PUT(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { weekday: number; slots: { start_time: string; end_time: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { weekday, slots } = body;

  if (
    typeof weekday !== "number" ||
    weekday < 0 ||
    weekday > 6 ||
    !Array.isArray(slots)
  ) {
    return NextResponse.json(
      { error: "weekday must be 0-6 and slots must be an array" },
      { status: 400 }
    );
  }

  // Delete existing slots for this user+weekday
  const { error: delError } = await supabase
    .from("caregiver_availability_slots")
    .delete()
    .eq("user_id", user.id)
    .eq("weekday", weekday);

  if (delError)
    return NextResponse.json({ error: delError.message }, { status: 500 });

  // Insert new slots (if any)
  if (slots.length > 0) {
    const rows = slots.map((s) => ({
      user_id: user.id,
      weekday,
      start_time: s.start_time,
      end_time: s.end_time,
    }));
    const { error: insertError } = await supabase
      .from("caregiver_availability_slots")
      .insert(rows);
    if (insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
