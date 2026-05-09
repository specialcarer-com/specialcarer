import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ANOMALY_STATUSES } from "@/lib/ai/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * PATCH /api/admin/ai/anomalies/[id]
 * Body: { status, resolution_notes? }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: prof } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();
  if (prof?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const p = (body ?? {}) as Record<string, unknown>;
  const status = p.status;
  if (
    typeof status !== "string" ||
    !(ANOMALY_STATUSES as readonly string[]).includes(status)
  ) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }
  const update: Record<string, unknown> = {
    status,
    triaged_by: user.id,
    triaged_at: new Date().toISOString(),
  };
  if (typeof p.resolution_notes === "string") {
    update.resolution_notes = p.resolution_notes.slice(0, 2000);
  }

  const { error } = await admin
    .from("ai_anomaly_signals")
    .update(update)
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
