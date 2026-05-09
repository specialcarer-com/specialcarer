import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type IdBody = { caregiverId?: string; caregiver_id?: string };

async function readId(req: Request): Promise<string | null> {
  try {
    const json = (await req.json()) as IdBody;
    const id = (json.caregiverId ?? json.caregiver_id ?? "").trim();
    return id || null;
  } catch {
    return null;
  }
}

/** POST { caregiverId } — save (idempotent). */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const caregiverId = await readId(req);
  if (!caregiverId) {
    return NextResponse.json({ error: "Missing caregiverId" }, { status: 400 });
  }
  const { error } = await supabase
    .from("saved_caregivers")
    .upsert(
      { seeker_id: user.id, caregiver_id: caregiverId },
      { onConflict: "seeker_id,caregiver_id" },
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ saved: true });
}

/** DELETE { caregiverId } — unsave (idempotent). */
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const caregiverId = await readId(req);
  if (!caregiverId) {
    return NextResponse.json({ error: "Missing caregiverId" }, { status: 400 });
  }
  const { error } = await supabase
    .from("saved_caregivers")
    .delete()
    .eq("seeker_id", user.id)
    .eq("caregiver_id", caregiverId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ saved: false });
}
