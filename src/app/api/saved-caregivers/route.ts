import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** POST { caregiver_id } — save (toggle on). */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { caregiver_id } = (await req.json()) as { caregiver_id?: string };
  if (!caregiver_id) {
    return NextResponse.json({ error: "Missing caregiver_id" }, { status: 400 });
  }
  const { error } = await supabase
    .from("saved_caregivers")
    .upsert({ seeker_id: user.id, caregiver_id }, { onConflict: "seeker_id,caregiver_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ saved: true });
}

/** DELETE { caregiver_id } — unsave. */
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { caregiver_id } = (await req.json()) as { caregiver_id?: string };
  if (!caregiver_id) {
    return NextResponse.json({ error: "Missing caregiver_id" }, { status: 400 });
  }
  const { error } = await supabase
    .from("saved_caregivers")
    .delete()
    .eq("seeker_id", user.id)
    .eq("caregiver_id", caregiver_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ saved: false });
}
