import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/favourites — list the caller's saved carer IDs.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("saved_caregivers")
    .select("caregiver_id, created_at")
    .eq("seeker_id", user.id)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ favourites: data ?? [] });
}

/**
 * POST /api/me/favourites { carer_id } — save (idempotent thanks to the
 * UNIQUE(seeker_id, caregiver_id) constraint on saved_caregivers).
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { carer_id?: string; caregiver_id?: string };
  try {
    body = (await req.json()) as { carer_id?: string; caregiver_id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const carerId = (body.carer_id ?? body.caregiver_id ?? "").trim();
  if (!carerId) {
    return NextResponse.json({ error: "Missing carer_id" }, { status: 400 });
  }
  if (carerId === user.id) {
    return NextResponse.json(
      { error: "Cannot save yourself" },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("saved_caregivers")
    .upsert(
      { seeker_id: user.id, caregiver_id: carerId },
      { onConflict: "seeker_id,caregiver_id" },
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ saved: true });
}
