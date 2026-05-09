import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SURGE_MAX_MULTIPLIER,
  SURGE_VERTICALS,
} from "@/lib/admin-ops/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ops/surge-rules — list (admin).
 * POST /api/admin/ops/surge-rules — create.
 * Body: { city_slug, vertical, multiplier, condition_jsonb?, active? }
 */
export async function GET() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("surge_rules")
    .select(
      "id, city_slug, vertical, condition_jsonb, multiplier, active, created_by, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rules: data ?? [] });
}

export async function POST(req: Request) {
  const me = await requireAdmin();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const p = (body ?? {}) as Record<string, unknown>;
  const citySlug = typeof p.city_slug === "string" ? p.city_slug : "";
  const vertical = typeof p.vertical === "string" ? p.vertical : "";
  const mult = typeof p.multiplier === "number" ? p.multiplier : NaN;
  const cond =
    p.condition_jsonb && typeof p.condition_jsonb === "object"
      ? p.condition_jsonb
      : {};
  const active = typeof p.active === "boolean" ? p.active : true;

  if (!citySlug) {
    return NextResponse.json({ error: "missing_city" }, { status: 400 });
  }
  if (!(SURGE_VERTICALS as readonly string[]).includes(vertical)) {
    return NextResponse.json({ error: "invalid_vertical" }, { status: 400 });
  }
  if (
    !Number.isFinite(mult) ||
    mult < 1.0 ||
    mult > SURGE_MAX_MULTIPLIER
  ) {
    return NextResponse.json({ error: "invalid_multiplier" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("surge_rules")
    .insert({
      city_slug: citySlug,
      vertical,
      multiplier: mult,
      condition_jsonb: cond,
      active,
      created_by: me.id,
    })
    .select("id, city_slug, vertical, multiplier, active")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "insert_failed" },
      { status: 500 },
    );
  }
  await logAdminAction({
    admin: me,
    action: "surge_rule.create",
    targetType: "surge_rule",
    targetId: data.id,
    details: { city: citySlug, vertical, multiplier: mult },
  });
  return NextResponse.json({ rule: data });
}
