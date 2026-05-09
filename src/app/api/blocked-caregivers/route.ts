import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type IdBody = {
  caregiverId?: string;
  caregiver_id?: string;
  reason?: string;
};

async function readBody(req: Request): Promise<{ id: string | null; reason: string | null }> {
  try {
    const json = (await req.json()) as IdBody;
    const id = (json.caregiverId ?? json.caregiver_id ?? "").trim();
    const reason =
      typeof json.reason === "string" && json.reason.trim().length > 0
        ? json.reason.trim().slice(0, 280)
        : null;
    return { id: id || null, reason };
  } catch {
    return { id: null, reason: null };
  }
}

/**
 * POST { caregiverId, reason? } — block this carer for the current
 * seeker. Idempotent. Also removes any saved-favorite row so the carer
 * disappears from /account/saved + /m/profile.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: caregiverId, reason } = await readBody(req);
  if (!caregiverId) {
    return NextResponse.json({ error: "Missing caregiverId" }, { status: 400 });
  }

  const { error } = await supabase.from("blocked_caregivers").upsert(
    {
      seeker_id: user.id,
      caregiver_id: caregiverId,
      reason,
    },
    { onConflict: "seeker_id,caregiver_id" },
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Best-effort: drop the carer from the seeker's favorites so the
  // "saved" list stays consistent with the block list.
  await supabase
    .from("saved_caregivers")
    .delete()
    .eq("seeker_id", user.id)
    .eq("caregiver_id", caregiverId);

  return NextResponse.json({ blocked: true });
}

/** DELETE { caregiverId } — unblock (idempotent). */
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: caregiverId } = await readBody(req);
  if (!caregiverId) {
    return NextResponse.json({ error: "Missing caregiverId" }, { status: 400 });
  }

  const { error } = await supabase
    .from("blocked_caregivers")
    .delete()
    .eq("seeker_id", user.id)
    .eq("caregiver_id", caregiverId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ blocked: false });
}
