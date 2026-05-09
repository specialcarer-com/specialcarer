import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/m/preferred-clients/[seekerId] — toggle preferred status.
 *
 * If the row already exists we delete it (un-preferred); if not we
 * insert it. Response includes the resulting state so the UI can sync
 * its heart-toggle without a follow-up read.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ seekerId: string }> },
) {
  const { seekerId } = await params;
  if (!UUID_RE.test(seekerId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (user.id === seekerId) {
    return NextResponse.json(
      { error: "Cannot prefer yourself" },
      { status: 400 },
    );
  }

  const { data: existing } = await supabase
    .from("carer_preferred_clients")
    .select("carer_id")
    .eq("carer_id", user.id)
    .eq("seeker_id", seekerId)
    .maybeSingle<{ carer_id: string }>();

  if (existing) {
    const { error } = await supabase
      .from("carer_preferred_clients")
      .delete()
      .eq("carer_id", user.id)
      .eq("seeker_id", seekerId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ preferred: false });
  }

  const { error } = await supabase
    .from("carer_preferred_clients")
    .insert({ carer_id: user.id, seeker_id: seekerId });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ preferred: true });
}
